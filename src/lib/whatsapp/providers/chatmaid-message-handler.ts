import {
  canPerformWhatsAppFinancialLookup,
  createSupabaseProcessedMessageStore,
  createSupabaseWhatsAppFinancialRepository,
  createSupabaseWhatsAppIdentityRepository,
  handleFinancialMessage,
  handleResidentMessage,
  processInboundMessages,
} from '@/lib/whatsapp';
import { isStopCommand } from '@/lib/whatsapp/identity';
import { createSupabaseChatmaidSessionPauseStore } from '@/lib/whatsapp/providers/chatmaid-inbound';
import type { InboundMessageResult, WhatsAppInboundMessage } from '@/lib/whatsapp/types';

export interface ChatmaidMessageBatchResult {
  result: InboundMessageResult;
  /** Messages claimed but left unanswered because an admin took over the conversation on the handset. */
  pausedCount: number;
}

/**
 * Answers a batch of Chatmaid inbound messages. Shared by the webhook and the
 * reconciliation cron (#511), so a message gets the same claim/release dedupe,
 * human-takeover pause and Assistant reply whichever path delivers it.
 */
export async function processChatmaidMessages(
  messages: WhatsAppInboundMessage[]
): Promise<ChatmaidMessageBatchResult> {
  const pauseStore = createSupabaseChatmaidSessionPauseStore();
  let pausedCount = 0;

  const result = await processInboundMessages(messages, {
    store: createSupabaseProcessedMessageStore(),
    onMessage: async (message) => {
      // Human takeover: an admin typed on the handset recently, so the
      // Assistant stays quiet. The message is still claimed, so a retry does
      // not answer it once the pause lapses.
      const pausedUntil = await pauseStore.getPausedUntil(message.from);
      if (pausedUntil && Date.now() < pausedUntil.getTime()) {
        pausedCount += 1;
        // STOP is still honoured, silently, so the admin's conversation is not interrupted.
        if (isStopCommand(message.text?.trim() || '')) {
          await handleResidentMessage(message, {
            repository: createSupabaseWhatsAppIdentityRepository(),
            send: async () => ({ success: true }),
          });
        }
        return;
      }

      await handleResidentMessage(message, {
        repository: createSupabaseWhatsAppIdentityRepository(),
        onIdentified: async (identifiedMessage, identity) => {
          await handleFinancialMessage(identifiedMessage, identity, {
            repository: createSupabaseWhatsAppFinancialRepository(),
            optedIn: true,
            canLookup: canPerformWhatsAppFinancialLookup,
          });
        },
      });
    },
  });

  return { result, pausedCount };
}
