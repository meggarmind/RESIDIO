import { createHash, randomInt } from 'node:crypto';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import {
  createWhatsAppPrivacyNoticeUrl,
  loadEstateOfficeContactLine,
  loadWhatsAppPrivacyNotice,
  type WhatsAppPrivacyNotice,
} from '@/lib/whatsapp/privacy-notice';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { contactLine } from '@/lib/whatsapp/assistant-format';
import { createSupabaseWhatsAppFinancialRepository } from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage, WhatsAppTextMessage } from '@/lib/whatsapp/types';

const BILLABLE_ROLES = new Set([
  'resident_landlord',
  'non_resident_landlord',
  'tenant',
  'developer',
]);

export interface WhatsAppResidentIdentity {
  id: string;
  firstName: string;
  lastName: string;
  residentCode: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  financialEligible: boolean;
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
  getPrivacyNoticeUrl(notice: WhatsAppPrivacyNotice): Promise<string>;
  getOfficeContactLine(): Promise<string>;
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

async function getFinancialEligibility(residentId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('resident_houses')
    .select('resident_role')
    .eq('resident_id', residentId)
    .eq('is_active', true);

  return (data || []).some((assignment) => BILLABLE_ROLES.has(assignment.resident_role));
}

function isOnRoster(
  resident: { phone_primary: string | null; phone_secondary: string | null },
  normalized: string
): boolean {
  return [resident.phone_primary, resident.phone_secondary]
    .filter(Boolean)
    .some((phone) => normalizePhoneNumber(phone as string) === normalized);
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
  financialEligible: boolean
): WhatsAppResidentIdentity {
  return {
    id: resident.id,
    firstName: resident.first_name,
    lastName: resident.last_name,
    residentCode: resident.resident_code,
    phonePrimary: resident.phone_primary,
    phoneSecondary: resident.phone_secondary,
    financialEligible,
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
          createIdentity(resident, await getFinancialEligibility(resident.id))
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
        (residents || []).map(async (resident) =>
          createIdentity(
            resident,
            (isOnRoster(resident, normalized) || codeVerified.has(resident.id)) &&
              (await getFinancialEligibility(resident.id))
          )
        )
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

    getPrivacyNotice: loadWhatsAppPrivacyNotice,
    getPrivacyNoticeUrl: createWhatsAppPrivacyNoticeUrl,
    getOfficeContactLine: loadEstateOfficeContactLine,
  };
}

export interface WhatsAppIdentityHandlerOptions {
  repository: WhatsAppIdentityRepository;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
  estateContactLine?: () => Promise<string | null>;
  onIdentified?: (
    message: WhatsAppInboundMessage,
    identity: WhatsAppResidentIdentity
  ) => Promise<void>;
}

export interface WhatsAppIdentityResult {
  status: 'identified' | 'linked' | 'ambiguous' | 'pending' | 'opted_out' | 'consent_pending' | 'disputed' | 'declined';
  residentId: string | null;
  optedIn: boolean;
  financialEligible: boolean;
  accessTier: 'community' | 'financial';
}

function isStopCommand(text: string): boolean {
  return /^(STOP|UNSUBSCRIBE|OPT\s*OUT)\b/i.test(text.trim());
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

function privacyNoticePrompt(version: string): string {
  return withLines(
    `Before I use your estate records, please read our privacy notice (version ${version}), attached as a PDF.`,
    '1. Accept',
    '2. Decline'
  );
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
    { to: message.from, body, idempotencySeed: message.id, ...(mediaUrls ? { mediaUrls } : {}) }
  );

  if (!result.success) {
    throw new Error(result.error || 'WhatsApp reply failed');
  }
}

export async function handleResidentMessage(
  message: WhatsAppInboundMessage,
  options: WhatsAppIdentityHandlerOptions
): Promise<WhatsAppIdentityResult> {
  // Master switch (#547): when off the Assistant does nothing for an inbound
  // message -- no lookup, no pending-contact row, no state change, no reply.
  // This must stay the first read/write. The webhook still answers 200 (this
  // returns normally) and the processed-message store has already marked the
  // message handled, so messages received while the switch is off are NOT
  // replayed when it is turned back on. That is the accepted consequence.
  const masterSwitch = await isWhatsAppMasterSwitchOn();
  if (!masterSwitch.on) {
    console.warn(`WhatsApp Assistant inbound ignored: master switch off (${masterSwitch.reason})`);
    return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const phoneNumber = normalizePhoneNumber(message.from);
  const text = message.text?.trim() || '';
  const linked = await options.repository.findLinkedResidents(phoneNumber);
  const rosterMatches = linked.length > 0 ? linked : await options.repository.findRosterMatches(phoneNumber);
  const identity = rosterMatches.length === 1 ? rosterMatches[0] : null;

  if (isStopCommand(text)) {
    if (identity) {
      await options.repository.setOptIn(identity.id, phoneNumber, false, 'in_chat');
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

  const linkMatch = text.match(/^LINK\s+([0-9]{6,12})$/i);
  if (linkMatch) {
    if (await options.repository.isDisputed(phoneNumber)) {
      await sendReply(message, withLines(NOT_ME_REPLY, await options.repository.getOfficeContactLine()), options.send);
      return { status: 'disputed', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }
    const residentId = await options.repository.consumeLinkToken(linkMatch[1]);
    if (!residentId) {
      await sendReply(message, await withContact('That link code is invalid or expired. Ask the estate office for a new code.', options), options.send);
      return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }

    await options.repository.setOptIn(residentId, phoneNumber, false, 'in_chat', true);
    await options.repository.attachPendingContact(phoneNumber, residentId);
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
      await withContact('Welcome to the Residio Assistant. We could not safely match this number to one Resident. Ask the estate office for a link code, or reply STOP.', options),
      options.send
    );
    return { status: rosterMatches.length > 1 ? 'ambiguous' : 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const matchedIdentity = identity;
  if (!matchedIdentity) {
    return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
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

    const noticeUrl = await repository.getPrivacyNoticeUrl(notice);
    await reply(
      withLines(starting ? 'Estate WhatsApp alerts are now enabled.' : '', privacyNoticePrompt(notice.version)),
      [noticeUrl]
    );
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
