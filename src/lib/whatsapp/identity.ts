import { createHash, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import {
  createSupabaseWhatsAppHeldMessageStore,
  HOLDING_REPLY,
  isSecretShaped,
  type WhatsAppHeldMessageStore,
} from '@/lib/whatsapp/held-messages';
import {
  loadEstateOfficeContactLine,
  loadWhatsAppPrivacyNotice,
  type WhatsAppPrivacyNotice,
} from '@/lib/whatsapp/privacy-notice';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { getSponsoredHouses, isOnRoster } from '@/lib/whatsapp/co-resident';
import { contactLine, spaceOut } from '@/lib/whatsapp/assistant-format';
import { createSupabaseWhatsAppFinancialRepository, houseLabel, setAdminMenuStep, type WhatsAppFinancialRepository } from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';
import { loadAssistantName } from '@/lib/whatsapp/assistant-name';
import { SURVEY_OPT_OUT_REPLY, isSurveyStopCommand } from '@/lib/whatsapp/survey';
import { optOutOfSurveys } from '@/lib/whatsapp/survey-db';
import { BLOCKED_REPLY_HOURS } from '@/lib/whatsapp/retention';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import {
  createSupabaseWhatsAppAdminRepository,
  handleWhatsAppAdminMessage,
  handleWhatsAppAdminStep,
  isAdminNode,
  parseWhatsAppAdminCommand,
  type WhatsAppAdminHandlerOptions,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';

const BILLABLE_ROLES = new Set([
  'resident_landlord',
  'non_resident_landlord',
  'tenant',
  'developer',
]);

/** Who may use the Assistant at all (#1070): the billable roles plus co-residents. Everyone else is blocked. */
const ASSISTANT_ROLES = new Set([...BILLABLE_ROLES, 'co_resident']);

/** Wrong LINK codes a number may try within the window before it is locked out (#1058). */
const LINK_TRIES_PER_WINDOW = 5;
const LINK_WINDOW_MINUTES = 15;
const LINK_LOCKED_REPLY = `Too many wrong link codes. Try again in ${LINK_WINDOW_MINUTES} minutes, or ask the estate office for a new code.`;

/** The generated types do not know the #1058 functions until that migration is applied and `npm run db:types` is re-run. */
interface LinkAttemptRpcClient {
  rpc(
    name: 'claim_whatsapp_link_try',
    args: { p_phone_number: string; p_limit: number; p_window_minutes: number }
  ): PromiseLike<{ data: boolean | null; error: unknown }>;
  rpc(name: 'clear_whatsapp_link_tries', args: { p_phone_number: string }): PromiseLike<{ data: null; error: unknown }>;
}

export interface WhatsAppResidentIdentity {
  id: string;
  firstName: string;
  lastName: string;
  residentCode: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  financialEligible: boolean;
  /** An active residency in an in-scope role (#1070); false means the Assistant is closed to this person. */
  accessAllowed: boolean;
}

export interface WhatsAppIdentityRepository {
  findRosterMatches(phoneNumber: string): Promise<WhatsAppResidentIdentity[]>;
  findLinkedResidents(phoneNumber: string): Promise<WhatsAppResidentIdentity[]>;
  getOptIn(residentId: string, phoneNumber: string): Promise<boolean>;
  setOptIn(
    residentId: string,
    phoneNumber: string,
    optedIn: boolean,
    source: 'in_chat' | 'admin_import' | 'admin',
    linkVerified?: boolean
  ): Promise<void>;
  rememberPendingContact(phoneNumber: string): Promise<void>;
  consumeLinkToken(token: string): Promise<string | null>;
  /** Who created a live LINK code in the Assistant (#1072); null for an office code or no live code. */
  findLinkCodeIssuer(token: string): Promise<LinkCodeIssuer | null>;
  /** Tells the sponsor their co-resident's number is linked. Never throws. */
  sendLinkNotice(sponsorId: string, body: string, seed: string): Promise<void>;
  /**
   * Counts a LINK try as wrong before the code is checked (atomic, per number); false once the number
   * has used up its tries in the window (#1058).
   */
  claimLinkAttempt(phoneNumber: string): Promise<boolean>;
  /** A valid code was entered: the number's wrong-try count starts over. */
  clearLinkAttempts(phoneNumber: string): Promise<void>;
  attachPendingContact(phoneNumber: string, residentId: string): Promise<void>;
  // Identity read-back and privacy consent (#871).
  getStreetName(residentId: string): Promise<string | null>;
  getConsentState(residentId: string, phoneNumber: string): Promise<WhatsAppConsentState>;
  recordConsentDecision(input: WhatsAppConsentDecisionInput): Promise<void>;
  saveConsentStep(phoneNumber: string, residentId: string, step: string | null, pendingRequest: string | null): Promise<void>;
  isDisputed(phoneNumber: string): Promise<boolean>;
  markDisputed(phoneNumber: string, residentId: string): Promise<void>;
  notifyDisputed(phoneNumber: string, residentId: string): Promise<void>;
  getPrivacyNotice(): Promise<WhatsAppPrivacyNotice | null>;
  getOfficeContactLine(): Promise<string>;
  /**
   * Records that the blocked-number reply is being sent now (#1070). True once per number per 24 hours,
   * atomically; false when one was already sent in the window.
   */
  claimBlockedReply(phoneNumber: string, residentId: string): Promise<boolean>;
  getEstateName(): Promise<string>;
  getAssistantName(): Promise<string>;
  /** STOP SURVEYS (#872): the assistant never asks this resident for feedback again. */
  optOutOfSurveys(residentId: string): Promise<void>;
}

/** A sponsor who created a LINK code for their co-resident, with what the notice names (#1072). */
export interface LinkCodeIssuer {
  residentId: string;
  coResidentFirstName: string;
  houseLabel: string;
}

export const OWN_NUMBER_LINK_REPLY = 'This code was created for your co-resident. They need to send it from their own WhatsApp number.';

export function linkNotice(issuer: LinkCodeIssuer): string {
  return `${issuer.coResidentFirstName} is now linked to ${issuer.houseLabel} on WhatsApp.`;
}

export type WhatsAppConsentDecision = 'identity_confirmed' | 'identity_disputed' | 'privacy_accepted' | 'privacy_declined';

export interface WhatsAppConsentDecisionInput {
  residentId: string;
  phoneNumber: string;
  decision: WhatsAppConsentDecision;
  noticeVersion?: string;
  identityFingerprint?: string;
  providerMessageId: string;
}

export interface WhatsAppConsentState {
  /** Read-back fingerprint last confirmed on this number; null unless the latest identity decision is a confirmation. */
  confirmedFingerprint: string | null;
  privacy: { decision: 'privacy_accepted' | 'privacy_declined'; version: string } | null;
  /** The consent prompt this number was last shown, so a bare "1" only answers a prompt it saw. */
  step: string | null;
  pendingRequest: string | null;
}

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

async function getAccess(residentId: string): Promise<{ financialEligible: boolean; accessAllowed: boolean }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('resident_houses')
    .select('resident_role')
    .eq('resident_id', residentId)
    .eq('is_active', true);

  const roles = (data || []).map((assignment) => assignment.resident_role);
  // A co-resident reaches the financial menu only through a live sponsor link (#1071).
  const sponsored = roles.includes('co_resident') && (await getSponsoredHouses(residentId)).length > 0;
  return {
    financialEligible: sponsored || roles.some((role) => BILLABLE_ROLES.has(role)),
    accessAllowed: roles.some((role) => ASSISTANT_ROLES.has(role)),
  };
}

function createIdentity(
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    phone_primary: string | null;
    phone_secondary: string | null;
  },
  access: { financialEligible: boolean; accessAllowed: boolean }
): WhatsAppResidentIdentity {
  return {
    id: resident.id,
    firstName: resident.first_name,
    lastName: resident.last_name,
    residentCode: resident.resident_code,
    phonePrimary: resident.phone_primary,
    phoneSecondary: resident.phone_secondary,
    financialEligible: access.financialEligible,
    accessAllowed: access.accessAllowed,
  };
}

export function createSupabaseWhatsAppIdentityRepository(): WhatsAppIdentityRepository {
  return {
    async findRosterMatches(phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, phone_primary, phone_secondary')
        .in('account_status', ['active', 'inactive']);

      if (error) {
        throw error;
      }

      const normalized = normalizePhoneNumber(phoneNumber);
      const matches = (data || []).filter((resident) => isOnRoster(resident, normalized));

      return Promise.all(
        matches.map(async (resident) =>
          createIdentity(resident, await getAccess(resident.id))
        )
      );
    },

    async findLinkedResidents(phoneNumber) {
      const supabase = createAdminClient();
      const normalized = normalizePhoneNumber(phoneNumber);
      const { data, error } = await supabase
        .from('whatsapp_optins')
        .select('resident_id, link_verified_at')
        .eq('phone_number', normalized)
        .is('deactivated_at', null);

      if (error) {
        throw error;
      }

      const residentIds = [...new Set((data || []).map((row) => row.resident_id))];
      if (residentIds.length === 0) {
        return [];
      }
      const codeVerified = new Set((data || []).filter((row) => row.link_verified_at).map((row) => row.resident_id));

      const { data: residents, error: residentError } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, phone_primary, phone_secondary')
        .in('id', residentIds)
        .in('account_status', ['active', 'inactive']);

      if (residentError) {
        throw residentError;
      }

      // A link is verified by its number being on the resident's roster or by a LINK code (#849);
      // an unverified link gets the community tier only.
      return Promise.all(
        (residents || []).map(async (resident) => {
          const access = await getAccess(resident.id);
          return createIdentity(resident, {
            financialEligible:
              (isOnRoster(resident, normalized) || codeVerified.has(resident.id)) && access.financialEligible,
            accessAllowed: access.accessAllowed,
          });
        })
      );
    },

    async getOptIn(residentId, phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('whatsapp_optins')
        .select('opted_in')
        .eq('resident_id', residentId)
        .eq('phone_number', normalizePhoneNumber(phoneNumber))
        .is('deactivated_at', null)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.opted_in === true;
    },

    async setOptIn(residentId, phoneNumber, optedIn, source, linkVerified = false) {
      const supabase = createAdminClient();
      const now = new Date().toISOString();
      const normalized = normalizePhoneNumber(phoneNumber);
      const { error } = await supabase.from('whatsapp_optins').upsert(
        {
          resident_id: residentId,
          phone_number: normalized,
          opted_in: optedIn,
          source,
          opted_in_at: optedIn ? now : null,
          opted_out_at: optedIn ? null : now,
          deactivated_at: null,
          ...(linkVerified ? { link_verified_at: now } : {}),
          updated_at: now,
        },
        { onConflict: 'resident_id,phone_number' }
      );

      if (error) {
        throw error;
      }
    },

    async rememberPendingContact(phoneNumber) {
      const supabase = createAdminClient();
      const now = new Date().toISOString();
      const normalized = normalizePhoneNumber(phoneNumber);
      const { data: existing, error: lookupError } = await supabase
        .from('whatsapp_pending_contacts')
        .select('id, status')
        .eq('phone_number', normalized)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      const query = existing
        ? supabase
            .from('whatsapp_pending_contacts')
          .update({ last_seen_at: now, updated_at: now, source: 'inbound' })
            .eq('id', existing.id)
        : supabase.from('whatsapp_pending_contacts').insert({
            phone_number: normalized,
            first_seen_at: now,
            last_seen_at: now,
            source: 'inbound',
            updated_at: now,
          });
      const { error } = await query;

      if (error) {
        throw error;
      }
    },

    async claimLinkAttempt(phoneNumber) {
      const { data, error } = await (createAdminClient() as unknown as LinkAttemptRpcClient).rpc('claim_whatsapp_link_try', {
        p_phone_number: normalizePhoneNumber(phoneNumber),
        p_limit: LINK_TRIES_PER_WINDOW,
        p_window_minutes: LINK_WINDOW_MINUTES,
      });
      if (error) throw error;
      return data === true;
    },

    async clearLinkAttempts(phoneNumber) {
      const { error } = await (createAdminClient() as unknown as LinkAttemptRpcClient).rpc('clear_whatsapp_link_tries', {
        p_phone_number: normalizePhoneNumber(phoneNumber),
      });
      if (error) throw error;
    },

    async consumeLinkToken(token) {
      const supabase = createAdminClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('whatsapp_link_tokens')
        .select('id, resident_id')
        .eq('token_hash', hashLinkToken(token))
        // A PIN setup code (#890) shares this table but must never link a number.
        .filter('purpose', 'eq', 'link')
        .is('used_at', null)
        .gt('expires_at', now)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      const { error: updateError } = await supabase
        .from('whatsapp_link_tokens')
        .update({ used_at: now })
        .eq('id', data.id)
        .is('used_at', null);

      if (updateError) {
        throw updateError;
      }

      return data.resident_id;
    },

    async findLinkCodeIssuer(token) {
      // The generated types do not know the issuer columns (#1072) until that migration is applied.
      const { data, error } = await (createAdminClient() as unknown as SupabaseClient)
        .from('whatsapp_link_tokens')
        .select('issued_by_resident_id, resident:residents!whatsapp_link_tokens_resident_id_fkey(first_name), house:houses(house_number, short_name, street:streets(name))')
        .eq('token_hash', hashLinkToken(token))
        .eq('purpose', 'link')
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .not('issued_by_resident_id', 'is', null)
        .maybeSingle();
      if (error) throw error;
      if (!data?.house) return null;
      const resident = (Array.isArray(data.resident) ? data.resident[0] : data.resident) as { first_name: string } | null;
      return { residentId: data.issued_by_resident_id as string, coResidentFirstName: resident?.first_name ?? 'Your co-resident', houseLabel: houseLabel(data.house) };
    },

    async sendLinkNotice(sponsorId, body, seed) {
      const result = await sendWhatsAppToResident(sponsorId, body, { seed });
      if (!result.sent) console.warn(`[whatsapp] co-resident link notice not sent: ${result.reason}`);
    },

    async attachPendingContact(phoneNumber, residentId) {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('whatsapp_pending_contacts')
        .update({
          resident_id: residentId,
          status: 'attached',
          updated_at: new Date().toISOString(),
        })
        .eq('phone_number', normalizePhoneNumber(phoneNumber))
        .neq('status', 'disputed');

      if (error) {
        throw error;
      }
    },

    async getStreetName(residentId) {
      const { data, error } = await createAdminClient()
        .from('resident_houses')
        .select('house:houses(street:streets(name))')
        .eq('resident_id', residentId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('house_id', { ascending: true });

      if (error) {
        throw error;
      }

      for (const row of data || []) {
        const house = (Array.isArray(row.house) ? row.house[0] : row.house) as { street?: { name?: string } | { name?: string }[] } | null;
        const street = Array.isArray(house?.street) ? house?.street[0] : house?.street;
        if (street?.name) return street.name;
      }
      return null;
    },

    async getConsentState(residentId, phoneNumber) {
      const supabase = createAdminClient();
      const normalized = normalizePhoneNumber(phoneNumber);
      const [decisions, session] = await Promise.all([
        supabase
          .from('whatsapp_consent_decisions')
          .select('decision, notice_version, identity_fingerprint')
          .eq('resident_id', residentId)
          .eq('phone_number', normalized)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('whatsapp_sessions')
          .select('consent_step, pending_request')
          .eq('phone_number', normalized)
          .maybeSingle(),
      ]);

      if (decisions.error) {
        throw decisions.error;
      }
      if (session.error) {
        throw session.error;
      }

      const rows = decisions.data || [];
      const identityRow = rows.find((row) => row.decision.startsWith('identity_'));
      const privacyRow = rows.find((row) => row.decision.startsWith('privacy_'));
      return {
        confirmedFingerprint: identityRow?.decision === 'identity_confirmed' ? identityRow.identity_fingerprint : null,
        privacy: privacyRow ? { decision: privacyRow.decision, version: privacyRow.notice_version } : null,
        step: session.data?.consent_step ?? null,
        pendingRequest: session.data?.pending_request ?? null,
      };
    },

    async recordConsentDecision(input) {
      const { error } = await createAdminClient().from('whatsapp_consent_decisions').insert({
        resident_id: input.residentId,
        phone_number: normalizePhoneNumber(input.phoneNumber),
        decision: input.decision,
        notice_version: input.noticeVersion ?? null,
        identity_fingerprint: input.identityFingerprint ?? null,
        provider_message_id: input.providerMessageId,
      });

      if (error) {
        throw error;
      }
    },

    async saveConsentStep(phoneNumber, residentId, step, pendingRequest) {
      const supabase = createAdminClient();
      const now = new Date().toISOString();
      const normalized = normalizePhoneNumber(phoneNumber);
      const { data: existing, error: lookupError } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('phone_number', normalized)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      // Never touch expires_at on a live session: that would extend a PIN-authenticated session.
      // A new row is born expired, so the financial handler starts its own session over it.
      const { error } = existing
        ? await supabase
            .from('whatsapp_sessions')
            .update({ consent_step: step, pending_request: pendingRequest, updated_at: now })
            .eq('id', existing.id)
        : await supabase.from('whatsapp_sessions').insert({
            phone_number: normalized,
            resident_id: residentId,
            expires_at: now,
            consent_step: step,
            pending_request: pendingRequest,
          });

      if (error) {
        throw error;
      }
    },

    async isDisputed(phoneNumber) {
      const { data, error } = await createAdminClient()
        .from('whatsapp_pending_contacts')
        .select('status')
        .eq('phone_number', normalizePhoneNumber(phoneNumber))
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.status === 'disputed';
    },

    async markDisputed(phoneNumber, residentId) {
      const now = new Date().toISOString();
      const { error } = await createAdminClient().from('whatsapp_pending_contacts').upsert(
        {
          phone_number: normalizePhoneNumber(phoneNumber),
          status: 'disputed',
          resident_id: residentId,
          source: 'inbound',
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: 'phone_number' }
      );

      if (error) {
        throw error;
      }
    },

    async notifyDisputed(phoneNumber, residentId) {
      // Best effort: the dispute is already recorded and the number blocked, so a failed alert must not
      // make the provider retry (the retry would only repeat the reply).
      const result = await notifyAdmins({
        title: 'WhatsApp number disputed',
        body:
          `The holder of a WhatsApp number ending ${normalizePhoneNumber(phoneNumber).slice(-4)} said it is not the registered resident. ` +
          'The assistant shows no details for it until an admin clears it under Settings > WhatsApp.',
        category: 'security',
        priority: 'high',
        actionUrl: '/settings/whatsapp',
        requiredPermission: PERMISSIONS.WHATSAPP_MANAGE,
        metadata: { source: 'whatsapp_identity', resident_id: residentId },
      });
      if (!result.success) {
        console.error('[whatsapp-identity] Disputed-number admin alert failed:', result.error);
      }
    },

    async claimBlockedReply(phoneNumber, residentId) {
      const supabase = createAdminClient() as unknown as SupabaseClient;
      const normalized = normalizePhoneNumber(phoneNumber);
      const now = new Date();
      const cutoff = new Date(now.getTime() - BLOCKED_REPLY_HOURS * 60 * 60 * 1000).toISOString();

      // One conditional update claims the slot, so two concurrent messages cannot both reply.
      const { data: claimed, error } = await supabase
        .from('whatsapp_sessions')
        .update({ blocked_reply_at: now.toISOString() })
        .eq('phone_number', normalized)
        .or(`blocked_reply_at.is.null,blocked_reply_at.lt.${cutoff}`)
        .select('id');
      if (error) throw error;
      if ((claimed || []).length > 0) return true;

      const { data: existing, error: lookupError } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('phone_number', normalized)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return false;

      // No session yet: a new row is born expired, like saveConsentStep's. The unique phone_number
      // rejects the loser of a race, which then stays silent.
      const { error: insertError } = await supabase.from('whatsapp_sessions').insert({
        phone_number: normalized,
        resident_id: residentId,
        expires_at: now.toISOString(),
        blocked_reply_at: now.toISOString(),
      });
      if (insertError) {
        if ((insertError as { code?: string }).code === '23505') return false;
        throw insertError;
      }
      return true;
    },

    async getEstateName() {
      const settings = await getRawSettingsAsService(['estate_name']);
      const name = settings.status === 'ok' ? settings.values.get('estate_name') : null;
      return typeof name === 'string' && name.trim() ? name.trim() : 'Residio Estate';
    },

    getAssistantName: loadAssistantName,

    getPrivacyNotice: loadWhatsAppPrivacyNotice,
    getOfficeContactLine: loadEstateOfficeContactLine,
    optOutOfSurveys,
  };
}

export interface WhatsAppIdentityHandlerOptions {
  repository: WhatsAppIdentityRepository;
  /** WhatsApp admin mode (#972); defaults to the Supabase repository. */
  adminRepository?: WhatsAppAdminRepository;
  /** Where the open resident menu step is ended after an admin turn (#1291). */
  financialRepository?: WhatsAppFinancialRepository;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
  estateContactLine?: () => Promise<string | null>;
  /** Messages held while the master switch is off (#1075); defaults to the Supabase store. */
  heldMessages?: WhatsAppHeldMessageStore;
  /** False drops a message while the switch is off, with no holding reply (human takeover). */
  holdWhenOff?: boolean;
  onIdentified?: (
    message: WhatsAppInboundMessage,
    identity: WhatsAppResidentIdentity
  ) => Promise<void>;
}

export interface WhatsAppIdentityResult {
  status: 'identified' | 'linked' | 'ambiguous' | 'pending' | 'opted_out' | 'consent_pending' | 'disputed' | 'declined' | 'admin' | 'blocked';
  residentId: string | null;
  optedIn: boolean;
  financialEligible: boolean;
  accessTier: 'community' | 'financial';
}

export function isStopCommand(text: string): boolean {
  // STOP SURVEYS only ends the feedback questions; it is not an alerts opt-out.
  return !isSurveyStopCommand(text) && /^(STOP|UNSUBSCRIBE|OPT\s*OUT)\b/i.test(text.trim());
}

function isStartCommand(text: string): boolean {
  return /^(START|SUBSCRIBE|YES|OPT\s*IN)\b/i.test(text.trim());
}

async function readContactLine(options: WhatsAppIdentityHandlerOptions): Promise<string | null> {
  try {
    if (options.estateContactLine) return await options.estateContactLine();
    const settings = await createSupabaseWhatsAppFinancialRepository().getAssistantSettings();
    return contactLine({ phone: settings.estatePhone, email: settings.estateEmail, hours: settings.officeHours }, new Date());
  } catch (error) {
    console.error('WhatsApp Assistant could not read the estate contact details:', error);
    return null;
  }
}

async function withContact(body: string, options: WhatsAppIdentityHandlerOptions): Promise<string> {
  const line = await readContactLine(options);
  return line ? `${body}\n${line}` : body;
}

const CONFIRM_IDENTITY = /^(1|yes|yes,? that's me|that's me)\.?$/i;
const DISPUTE_IDENTITY = /^(2|no|no,? not me|not me)\.?$/i;
const ACCEPT_NOTICE = /^(1|accept)\.?$/i;
const DECLINE_NOTICE = /^(2|decline)\.?$/i;
// Replies to a prompt, greetings and secrets are not a request worth resuming after consent (#871 step 7).
const NOT_A_REQUEST = /^(?:[\d\s]+|hi|hello|hey|menu|accept|decline|yes|no|not me|start|subscribe|opt\s*in|(?:pin|link)\b.*)$/i;
const MAX_PENDING_REQUEST_LENGTH = 500;

export function blockedReply(estateName: string): string {
  return `This service is for current residents of ${estateName}. Please contact the estate office.`;
}

export const NOT_ME_REPLY = "Thanks for telling us. I won't show any details for this number.";
export const DECLINED_REPLY = "Thanks, your choice is recorded. I won't use your records.";
export const ACCEPT_ANY_TIME = 'Reply ACCEPT any time to continue.';

function withLines(...lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

/** Ties a confirmation to what the resident was shown, so a roster change asks again (#871 step 1). */
export function identityFingerprint(identity: WhatsAppResidentIdentity, street: string | null): string {
  return createHash('sha256')
    .update([identity.id, identity.firstName, identity.lastName, street ?? ''].join('|'))
    .digest('hex')
    .slice(0, 32);
}

export function identityReadBack(identity: WhatsAppResidentIdentity, street: string | null): string {
  const initial = identity.lastName.trim().charAt(0).toUpperCase();
  const name = initial ? `${identity.firstName} ${initial}.` : identity.firstName;
  return withLines(
    `This number is registered to ${street ? `${name} on ${street}.` : name.endsWith('.') ? name : `${name}.`} Is that you?`,
    "1. Yes, that's me",
    '2. No, not me'
  );
}

/**
 * The notice goes in the chat body; WhatsApp renders the admin's `*bold*` and `_italic_` itself.
 * The version gets its own line unless the text already shows it with `{{Version}}`.
 */
function privacyNoticePrompt(notice: WhatsAppPrivacyNotice): string {
  return [notice.text, ...(notice.versionInText ? [] : [`_Version ${notice.version}_`]), '1. Accept\n2. Decline'].join('\n\n');
}

/** A failed send must reach the webhook (it releases the claim so the provider retries), not the failure reply. */
export class ReplySendError extends Error {
  // Set by hand so the failure reason (#1285) still names it in a minified build.
  name = 'ReplySendError';
}

async function sendReply(
  message: WhatsAppInboundMessage,
  body: string,
  send: WhatsAppIdentityHandlerOptions['send'],
  residentId: string | null = null,
  mediaUrls?: string[]
): Promise<void> {
  const result = await (send || ((outbound) =>
    // Reply to the person who just messaged us: exempt from the comms override (decision 8, #715).
    sendWhatsAppMessage(outbound, undefined, { purpose: 'inbound_reply' }, {
      residentId,
      inboundMessageId: message.id,
    })))(
    { to: message.from, body: spaceOut(body), idempotencySeed: message.id, ...(mediaUrls ? { mediaUrls } : {}) }
  );

  if (!result.success) {
    throw new ReplySendError(result.error || 'WhatsApp reply failed');
  }
}

/**
 * Admin and resident steps share the number's one conversation node (#1291, #1292), so the next
 * reply always goes to the step on screen. The admin step on screen, or null.
 */
async function openAdminStep(phoneNumber: string, financialRepository: WhatsAppFinancialRepository): Promise<string | null> {
  try {
    const stored = await financialRepository.getSession(phoneNumber);
    return stored && isAdminNode(stored.currentNode) && Date.parse(stored.expiresAt) > Date.now() ? stored.currentNode : null;
  } catch (error) {
    // A resident's message must not fail because the session cannot be read here; the resident path reads it again.
    console.error('WhatsApp Assistant could not read the conversation step for admin tools:', error);
    return null;
  }
}

export async function handleResidentMessage(
  message: WhatsAppInboundMessage,
  options: WhatsAppIdentityHandlerOptions
): Promise<WhatsAppIdentityResult> {
  // Master switch (#547): when off the Assistant reads no resident record and changes no state.
  // This must stay the first read/write. The message is saved and answered when the switch is
  // turned back on (held-replay.ts), and the number gets one holding reply per switch-off period
  // (#1075). A PIN-shaped message is never saved, but still gets the holding reply.
  const masterSwitch = await isWhatsAppMasterSwitchOn();
  const phoneNumber = normalizePhoneNumber(message.from);
  if (!masterSwitch.on) {
    console.warn(`WhatsApp Assistant inbound held: master switch off (${masterSwitch.reason})`);
    if (options.holdWhenOff !== false) {
      const held = options.heldMessages ?? createSupabaseWhatsAppHeldMessageStore();
      if (!isSecretShaped(message.text)) await held.save(message, phoneNumber);
      if (await held.claimHoldingReply(phoneNumber)) {
        await sendReply(message, await withContact(HOLDING_REPLY, options), options.send);
      }
    }
    return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const text = message.text?.trim() || '';

  // Admin tools (#972, #1292) take an exact ADMIN command, or the reply to an admin step on screen.
  // No resident record is read for them. A number that is not an admin number, and a reply that
  // leaves the admin steps, carry on to the resident behaviour below, so nothing is revealed.
  const financialRepository = options.financialRepository ?? createSupabaseWhatsAppFinancialRepository();
  const adminOptions: WhatsAppAdminHandlerOptions = {
    repository: options.adminRepository ?? createSupabaseWhatsAppAdminRepository(),
    reply: (body) => sendReply(message, body, options.send),
    setStep: async (node) => {
      try {
        await setAdminMenuStep(financialRepository, phoneNumber, node);
      } catch (error) {
        console.error('WhatsApp Assistant could not store the admin step:', error);
      }
    },
  };
  const adminCommand = parseWhatsAppAdminCommand(text);
  const adminStep = adminCommand ? null : await openAdminStep(phoneNumber, financialRepository);
  if (
    (adminCommand && (await handleWhatsAppAdminMessage(message, adminCommand, adminOptions))) ||
    (adminStep && (await handleWhatsAppAdminStep(message, adminStep, adminOptions)))
  ) {
    return { status: 'admin', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const linked = await options.repository.findLinkedResidents(phoneNumber);
  const rosterMatches = linked.length > 0 ? linked : await options.repository.findRosterMatches(phoneNumber);
  const identity = rosterMatches.length === 1 ? rosterMatches[0] : null;

  if (isStopCommand(text)) {
    // A shared number cannot say which resident typed STOP, so every match is opted out.
    for (const match of rosterMatches) {
      await options.repository.setOptIn(match.id, phoneNumber, false, 'in_chat');
    }
    await sendReply(
      message,
      "You've been unsubscribed from estate WhatsApp alerts. Reply START any time to re-subscribe.",
      options.send,
      identity?.id ?? null
    );
    return {
      status: 'opted_out',
      residentId: identity?.id || null,
      optedIn: false,
      financialEligible: identity?.financialEligible || false,
      accessTier: identity?.financialEligible ? 'financial' : 'community',
    };
  }

  if (identity && isSurveyStopCommand(text)) {
    await options.repository.optOutOfSurveys(identity.id);
    await sendReply(message, SURVEY_OPT_OUT_REPLY, options.send, identity.id);
    return {
      status: 'identified',
      residentId: identity.id,
      optedIn: await options.repository.getOptIn(identity.id, phoneNumber),
      financialEligible: identity.financialEligible,
      accessTier: identity.financialEligible ? 'financial' : 'community',
    };
  }

  const linkMatch = text.match(/^LINK\s+([0-9]{6,12})$/i);
  if (linkMatch) {
    if (await options.repository.isDisputed(phoneNumber)) {
      await sendReply(message, withLines(NOT_ME_REPLY, await options.repository.getOfficeContactLine()), options.send);
      return { status: 'disputed', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }
    // Counted before the code is checked, so concurrent guesses cannot all be checked before the lock lands.
    if (!(await options.repository.claimLinkAttempt(phoneNumber))) {
      await sendReply(message, await withContact(LINK_LOCKED_REPLY, options), options.send);
      return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }
    // A code a sponsor created is for their co-resident: any number of the sponsor's is refused (#1072 decision 5).
    const issuer = await options.repository.findLinkCodeIssuer(linkMatch[1]);
    if (issuer) {
      const holders = linked.length > 0 ? [...linked, ...(await options.repository.findRosterMatches(phoneNumber))] : rosterMatches;
      if (holders.some((holder) => holder.id === issuer.residentId)) {
        await sendReply(message, OWN_NUMBER_LINK_REPLY, options.send);
        return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
      }
    }
    const residentId = await options.repository.consumeLinkToken(linkMatch[1]);
    if (!residentId) {
      await sendReply(message, await withContact('That link code is invalid or expired. Ask the estate office for a new code.', options), options.send);
      return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }

    await options.repository.clearLinkAttempts(phoneNumber);
    await options.repository.setOptIn(residentId, phoneNumber, false, 'in_chat', true);
    await options.repository.attachPendingContact(phoneNumber, residentId);
    if (issuer) await options.repository.sendLinkNotice(issuer.residentId, linkNotice(issuer), `whatsapp-link-notice:${message.id}`);
    await sendReply(
      message,
      'Your number is linked. Reply YES to receive estate WhatsApp alerts, or STOP to decline them.',
      options.send,
      residentId
    );
    return { status: 'linked', residentId, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  if (rosterMatches.length !== 1) {
    await options.repository.rememberPendingContact(phoneNumber);
    await sendReply(
      message,
      await withContact(`Welcome to ${await options.repository.getAssistantName()}. We could not safely match this number to one Resident. Ask the estate office for a link code, or reply STOP.`, options),
      options.send
    );
    return { status: rosterMatches.length > 1 ? 'ambiguous' : 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const matchedIdentity = identity;
  if (!matchedIdentity) {
    return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  // Only a current resident in an in-scope role may use the Assistant (#1070). STOP and the admin flow
  // are handled above; a blocked number gets one fixed reply per 24 hours and silence after that.
  if (!matchedIdentity.accessAllowed) {
    if (await options.repository.claimBlockedReply(phoneNumber, matchedIdentity.id)) {
      const estateName = await options.repository.getEstateName();
      await sendReply(message, blockedReply(estateName), options.send, matchedIdentity.id);
    }
    return { status: 'blocked', residentId: matchedIdentity.id, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const repository = options.repository;
  const residentId = matchedIdentity.id;
  // The menu (#804) serves both tiers; the financial handler applies the tier and PIN gate itself.
  const financial = Boolean(options.onIdentified);
  const reply = (body: string, mediaUrls?: string[]) => sendReply(message, body, options.send, residentId, mediaUrls);
  const decide = (decision: WhatsAppConsentDecision, extra: Partial<WhatsAppConsentDecisionInput> = {}) =>
    repository.recordConsentDecision({ residentId, phoneNumber, decision, providerMessageId: message.id, ...extra });
  const result = (status: WhatsAppIdentityResult['status'], optedIn: boolean): WhatsAppIdentityResult => ({
    status,
    residentId,
    optedIn,
    financialEligible: matchedIdentity.financialEligible,
    accessTier: matchedIdentity.financialEligible ? 'financial' : 'community',
  });

  let optedIn = await repository.getOptIn(residentId, phoneNumber);

  // A disputed number gets no details until an admin clears it (#871 step 2). STOP above still works.
  if (await repository.isDisputed(phoneNumber)) {
    await reply(withLines(NOT_ME_REPLY, await repository.getOfficeContactLine()));
    return result('disputed', optedIn);
  }

  const answer = text.replace(/[‘’]/g, "'");
  const state = await repository.getConsentState(residentId, phoneNumber);
  const request = answer && !NOT_A_REQUEST.test(answer) ? text.slice(0, MAX_PENDING_REQUEST_LENGTH) : state.pendingRequest;

  // Step 1: identity read-back, once per number and again when the roster record changes.
  const street = await repository.getStreetName(residentId);
  const fingerprint = identityFingerprint(matchedIdentity, street);
  if (state.confirmedFingerprint !== fingerprint) {
    const identityStep = `identity:${fingerprint}`;
    if (state.step === identityStep && CONFIRM_IDENTITY.test(answer)) {
      await decide('identity_confirmed', { identityFingerprint: fingerprint });
    } else if (state.step === identityStep && DISPUTE_IDENTITY.test(answer)) {
      await decide('identity_disputed', { identityFingerprint: fingerprint });
      await repository.markDisputed(phoneNumber, residentId);
      await repository.saveConsentStep(phoneNumber, residentId, null, null);
      await repository.notifyDisputed(phoneNumber, residentId);
      await reply(withLines(NOT_ME_REPLY, await repository.getOfficeContactLine()));
      return result('disputed', optedIn);
    } else {
      await reply(identityReadBack(matchedIdentity, street));
      await repository.saveConsentStep(phoneNumber, residentId, identityStep, request);
      return result('consent_pending', optedIn);
    }
  }

  // START keeps its meaning (alerts opt-in), but not as an answer to a pending consent prompt.
  const starting = !state.step && isStartCommand(answer);
  if (starting) {
    await repository.setOptIn(residentId, phoneNumber, true, 'in_chat');
    optedIn = true;
  }

  // Step 3: privacy notice. No record is used until the current version is accepted.
  const notice = await repository.getPrivacyNotice();
  if (!notice) {
    await repository.saveConsentStep(phoneNumber, residentId, null, request);
    await reply(withLines(
      "I can't use your estate records yet: the estate's privacy notice has not been published.",
      await repository.getOfficeContactLine()
    ));
    return result('consent_pending', optedIn);
  }

  const accepted = state.privacy?.decision === 'privacy_accepted' && state.privacy.version === notice.version;
  if (!accepted) {
    const privacyStep = `privacy:${residentId}:${notice.version}`;
    const promptShown = state.step === privacyStep;
    const declined = state.privacy?.decision === 'privacy_declined' && state.privacy.version === notice.version;

    if ((promptShown && ACCEPT_NOTICE.test(answer)) || (declined && /^accept\.?$/i.test(answer))) {
      await decide('privacy_accepted', { noticeVersion: notice.version });
      const thanks = `Thanks, your acceptance of privacy notice ${notice.version} is recorded.`;
      await reply(financial ? thanks : withLines(
        thanks,
        'Estate announcements and notices will be sent here.',
        optedIn ? '' : 'Reply YES to receive estate WhatsApp alerts, or STOP to decline them.'
      ));
      if (financial) {
        // Step 7: answer the request that started the conversation, through the financial handler's PIN gate.
        await options.onIdentified!({ ...message, text: state.pendingRequest || 'MENU' }, matchedIdentity);
      }
      await repository.saveConsentStep(phoneNumber, residentId, null, null);
      return result('identified', optedIn);
    }

    if (promptShown && DECLINE_NOTICE.test(answer)) {
      await decide('privacy_declined', { noticeVersion: notice.version });
      await repository.saveConsentStep(phoneNumber, residentId, null, null);
      await reply(withLines(DECLINED_REPLY, await repository.getOfficeContactLine(), ACCEPT_ANY_TIME));
      return result('declined', optedIn);
    }

    if (declined) {
      // Store only the decision (#871 step 5): a request sent after declining is not kept.
      await reply(withLines(DECLINED_REPLY, await repository.getOfficeContactLine(), ACCEPT_ANY_TIME));
      return result('declined', optedIn);
    }

    await reply(withLines(starting ? 'Estate WhatsApp alerts are now enabled.' : '', privacyNoticePrompt(notice)));
    await repository.saveConsentStep(phoneNumber, residentId, privacyStep, request);
    return result('consent_pending', optedIn);
  }

  if (state.step) {
    // A consent step still set here was just answered (a re-confirmation, or a retry after the decision
    // was recorded): resume the held request instead of reading the answer as a menu choice.
    if (financial) {
      await options.onIdentified!({ ...message, text: state.pendingRequest || 'MENU' }, matchedIdentity);
    } else {
      await reply(`Thanks, ${matchedIdentity.firstName}. Estate announcements and notices will be sent here.`);
    }
    await repository.saveConsentStep(phoneNumber, residentId, null, null);
    return result('identified', optedIn);
  }

  if (starting) {
    if (financial) {
      await options.onIdentified!(message, matchedIdentity);
      return result('identified', true);
    }
    await reply(`You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Estate WhatsApp alerts are now enabled.`);
    return result('identified', true);
  }

  // Privacy consent, not the alerts opt-in, now gates the use of records (#871 step 9).
  if (financial) {
    await options.onIdentified!(message, matchedIdentity);
  } else {
    await reply(
      optedIn
        ? `You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Estate announcements and notices will be sent here.`
        : `You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Reply YES to receive estate WhatsApp alerts, or STOP to decline them.`
    );
  }
  return result('identified', optedIn);
}

export function generateWhatsAppLinkCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashWhatsAppLinkCode(code: string): string {
  return hashLinkToken(code);
}
