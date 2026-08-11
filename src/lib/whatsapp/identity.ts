import { createHash, randomInt } from 'node:crypto';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
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
    source: 'in_chat' | 'admin_import' | 'admin'
  ): Promise<void>;
  rememberPendingContact(phoneNumber: string): Promise<void>;
  consumeLinkToken(token: string): Promise<string | null>;
  attachPendingContact(phoneNumber: string, residentId: string): Promise<void>;
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
      const matches = (data || []).filter((resident) =>
        [resident.phone_primary, resident.phone_secondary]
          .filter(Boolean)
          .some((phone) => normalizePhoneNumber(phone as string) === normalized)
      );

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
        .select('resident_id')
        .eq('phone_number', normalized);

      if (error) {
        throw error;
      }

      const residentIds = [...new Set((data || []).map((row) => row.resident_id))];
      if (residentIds.length === 0) {
        return [];
      }

      const { data: residents, error: residentError } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, phone_primary, phone_secondary')
        .in('id', residentIds);

      if (residentError) {
        throw residentError;
      }

      return Promise.all(
        (residents || []).map(async (resident) =>
          createIdentity(resident, await getFinancialEligibility(resident.id))
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
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.opted_in === true;
    },

    async setOptIn(residentId, phoneNumber, optedIn, source) {
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
        .eq('phone_number', normalizePhoneNumber(phoneNumber));

      if (error) {
        throw error;
      }
    },
  };
}

export interface WhatsAppIdentityHandlerOptions {
  repository: WhatsAppIdentityRepository;
  send?: (message: WhatsAppTextMessage) => Promise<{ success: boolean; error?: string }>;
}

export interface WhatsAppIdentityResult {
  status: 'identified' | 'linked' | 'ambiguous' | 'pending' | 'opted_out';
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

async function sendReply(
  message: WhatsAppInboundMessage,
  body: string,
  send: WhatsAppIdentityHandlerOptions['send']
): Promise<void> {
  const result = await (send || ((outbound) => sendWhatsAppMessage(outbound)))(
    { to: message.from, body }
  );

  if (!result.success) {
    throw new Error(result.error || 'WhatsApp reply failed');
  }
}

export async function handleResidentMessage(
  message: WhatsAppInboundMessage,
  options: WhatsAppIdentityHandlerOptions
): Promise<WhatsAppIdentityResult> {
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
      options.send
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
    const residentId = await options.repository.consumeLinkToken(linkMatch[1]);
    if (!residentId) {
      await sendReply(message, 'That link code is invalid or expired. Ask an estate admin for a new code.', options.send);
      return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
    }

    await options.repository.setOptIn(residentId, phoneNumber, false, 'in_chat');
    await options.repository.attachPendingContact(phoneNumber, residentId);
    await sendReply(
      message,
      'Your number is linked. Reply YES to receive estate WhatsApp alerts, or STOP to decline them.',
      options.send
    );
    return { status: 'linked', residentId, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  if (rosterMatches.length !== 1) {
    await options.repository.rememberPendingContact(phoneNumber);
    await sendReply(
      message,
      'Welcome to the Residio WhatsApp Assistant. We could not safely match this number to one Resident. Ask an estate admin for a link code, or reply STOP.',
      options.send
    );
    return { status: rosterMatches.length > 1 ? 'ambiguous' : 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const matchedIdentity = identity;
  if (!matchedIdentity) {
    return { status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' };
  }

  const optedIn = await options.repository.getOptIn(matchedIdentity.id, phoneNumber);
  if (isStartCommand(text)) {
    await options.repository.setOptIn(matchedIdentity.id, phoneNumber, true, 'in_chat');
    await sendReply(
      message,
      `You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Estate WhatsApp alerts are now enabled.`,
      options.send
    );
    return { status: 'identified', residentId: matchedIdentity.id, optedIn: true, financialEligible: matchedIdentity.financialEligible, accessTier: matchedIdentity.financialEligible ? 'financial' : 'community' };
  }

  if (!optedIn) {
    await sendReply(
      message,
      `You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Reply YES to receive estate WhatsApp alerts, or STOP to decline them.`,
      options.send
    );
    return { status: 'identified', residentId: matchedIdentity.id, optedIn: false, financialEligible: matchedIdentity.financialEligible, accessTier: matchedIdentity.financialEligible ? 'financial' : 'community' };
  }

  await sendReply(
    message,
    `You're connected as ${matchedIdentity.firstName} ${matchedIdentity.lastName}. Estate announcements and notices will be sent here.`,
    options.send
  );
  return { status: 'identified', residentId: matchedIdentity.id, optedIn: true, financialEligible: matchedIdentity.financialEligible, accessTier: matchedIdentity.financialEligible ? 'financial' : 'community' };
}

export function generateWhatsAppLinkCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashWhatsAppLinkCode(code: string): string {
  return hashLinkToken(code);
}
