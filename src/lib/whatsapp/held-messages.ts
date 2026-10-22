/**
 * Inbound messages held while the WhatsApp master switch is off (#1075).
 *
 * The resident gets one holding reply per switch-off period, and the message is
 * answered through the normal handlers when the switch is turned back on
 * (`held-replay.ts`). Service-role only: the table has RLS on and no anon or
 * authenticated access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

export const HOLDING_REPLY = 'The estate Assistant is offline. Your message is saved and will be answered when it is back.';

/** A saved message older than this is dropped instead of answered (owner decision 2026-10-22). */
export const HELD_MESSAGE_MAX_AGE_HOURS = 24;

// A PIN or a setup code is never stored (#892): only digits, or anything starting with PIN.
const SECRET_SHAPED = /^(?:[\d\s]+$|pin)/i;

export function isSecretShaped(text: string | null): boolean {
  return SECRET_SHAPED.test(text?.trim() || '');
}

export interface WhatsAppHeldMessageStore {
  /** Saves the message for replay; a provider retry of the same message is ignored. */
  save(message: WhatsAppInboundMessage, phoneNumber: string): Promise<void>;
  /** True only for the first caller per number until the holding replies are cleared. */
  claimHoldingReply(phoneNumber: string): Promise<boolean>;
  /** Called when the switch is turned on, so the next switch-off period replies again. */
  clearHoldingReplies(): Promise<void>;
  /** Deletes saved messages received before the cutoff. */
  dropOlderThan(cutoff: Date): Promise<void>;
  /** Removes and returns the oldest saved message; null when none is left. */
  takeOldest(): Promise<WhatsAppInboundMessage | null>;
}

export function heldMessageCutoff(now: Date): Date {
  return new Date(now.getTime() - HELD_MESSAGE_MAX_AGE_HOURS * 60 * 60 * 1000);
}

export function createSupabaseWhatsAppHeldMessageStore(): WhatsAppHeldMessageStore {
  const client = () => createAdminClient() as unknown as SupabaseClient;

  const store: WhatsAppHeldMessageStore = {
    async save(message, phoneNumber) {
      const now = new Date();
      // Expired messages are never answered, so they do not wait for the switch to come back on.
      await store.dropOlderThan(heldMessageCutoff(now));

      const { error } = await client().from('whatsapp_held_messages').upsert(
        { message_id: message.id, phone_number: phoneNumber, message, received_at: now.toISOString() },
        { onConflict: 'message_id', ignoreDuplicates: true }
      );
      if (error) throw error;
    },

    async claimHoldingReply(phoneNumber) {
      // The primary key on phone_number rejects the loser of a race, which stays silent.
      const { error } = await client().from('whatsapp_holding_replies').insert({ phone_number: phoneNumber });
      if (!error) return true;
      if ((error as { code?: string }).code === '23505') return false;
      throw error;
    },

    async clearHoldingReplies() {
      const { error } = await client().from('whatsapp_holding_replies').delete().not('phone_number', 'is', null);
      if (error) throw error;
    },

    async dropOlderThan(cutoff) {
      const { error } = await client().from('whatsapp_held_messages').delete().lt('received_at', cutoff.toISOString());
      if (error) throw error;
    },

    async takeOldest() {
      const supabase = client();
      for (;;) {
        const { data: oldest, error } = await supabase
          .from('whatsapp_held_messages')
          .select('id')
          .order('received_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!oldest) return null;

        // Deleting is the claim: of two overlapping replays only one gets the row back.
        const { data: taken, error: takeError } = await supabase
          .from('whatsapp_held_messages')
          .delete()
          .eq('id', oldest.id)
          .select('message');
        if (takeError) throw takeError;
        if (taken && taken.length > 0) return taken[0].message as WhatsAppInboundMessage;
      }
    },
  };
  return store;
}
