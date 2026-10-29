/**
 * Answers the messages held while the WhatsApp master switch was off (#1075),
 * oldest first, through the same handlers as the inbound webhook. Each message
 * is removed from the store before it is handled, so it is answered at most
 * once even when two replays overlap.
 */

import { canPerformWhatsAppFinancialLookup, createSupabaseWhatsAppFinancialRepository, handleFinancialMessage } from '@/lib/whatsapp/financial';
import { createWhatsAppAdminTools } from '@/lib/whatsapp/admin';
import {
  createSupabaseWhatsAppHeldMessageStore,
  heldMessageCutoff,
  type WhatsAppHeldMessageStore,
} from '@/lib/whatsapp/held-messages';
import { createSupabaseWhatsAppIdentityRepository, handleResidentMessage } from '@/lib/whatsapp/identity';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

async function answer(message: WhatsAppInboundMessage): Promise<void> {
  await handleResidentMessage(message, {
    repository: createSupabaseWhatsAppIdentityRepository(),
    onIdentified: async (identifiedMessage, identity) => {
      await handleFinancialMessage(identifiedMessage, identity, {
        repository: createSupabaseWhatsAppFinancialRepository(),
        optedIn: true,
        canLookup: canPerformWhatsAppFinancialLookup,
        adminTools: createWhatsAppAdminTools(),
      });
    },
  });
}

export async function replayHeldWhatsAppMessages(options: {
  store?: WhatsAppHeldMessageStore;
  handle?: (message: WhatsAppInboundMessage) => Promise<void>;
  now?: () => Date;
} = {}): Promise<{ replayed: number }> {
  const masterSwitch = await isWhatsAppMasterSwitchOn();
  if (!masterSwitch.on) return { replayed: 0 };

  const store = options.store ?? createSupabaseWhatsAppHeldMessageStore();
  const handle = options.handle ?? answer;
  await store.clearHoldingReplies();
  await store.dropOlderThan(heldMessageCutoff((options.now ?? (() => new Date()))()));

  let replayed = 0;
  for (let message = await store.takeOldest(); message; message = await store.takeOldest()) {
    replayed += 1;
    try {
      await handle(message);
    } catch (error) {
      // Already taken from the store: a failed answer is not retried, so it is answered at most once.
      console.error(`WhatsApp held message ${message.id} could not be answered:`, error);
    }
  }
  return { replayed };
}
