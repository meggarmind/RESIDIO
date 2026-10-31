import { createAdminClient } from '@/lib/supabase/server';
import type {
  InboundMessageHandlerOptions,
  InboundMessageResult,
  ProcessedMessageStore,
  WhatsAppInboundMessage,
  WhatsAppInboundPayload,
} from '@/lib/whatsapp/types';

export function extractWhatsAppMessages(
  payload: WhatsAppInboundPayload
): WhatsAppInboundMessage[] {
  const messages: WhatsAppInboundMessage[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        if (!message.id || !message.from || !message.timestamp || !message.type) {
          continue;
        }

        messages.push({
          id: message.id,
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body ?? null,
        });
      }
    }
  }

  return messages;
}

export function createSupabaseProcessedMessageStore(): ProcessedMessageStore {
  return {
    async claim(messageId, receivedAt) {
      const supabase = createAdminClient();
      const expiresBefore = new Date().toISOString();
      const { error: expiryError } = await supabase
        .from('whatsapp_processed_messages')
        .delete()
        .eq('message_id', messageId)
        .lt('expires_at', expiresBefore);

      if (expiryError) {
        throw expiryError;
      }

      const { error } = await supabase.from('whatsapp_processed_messages').insert({
        message_id: messageId,
        received_at: receivedAt,
        expires_at: new Date(Date.parse(receivedAt) + 24 * 60 * 60 * 1000).toISOString(),
      });

      if (!error) {
        return 'claimed';
      }

      if (error.code === '23505') {
        return 'duplicate';
      }

      throw error;
    },
    async release(messageId) {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from('whatsapp_processed_messages')
        .delete()
        .eq('message_id', messageId);

      if (error) {
        throw error;
      }
    },
  };
}

export function createInMemoryProcessedMessageStore(): ProcessedMessageStore {
  const ids = new Set<string>();

  return {
    async claim(messageId) {
      if (ids.has(messageId)) {
        return 'duplicate';
      }

      ids.add(messageId);
      return 'claimed';
    },
    async release(messageId) {
      ids.delete(messageId);
    },
  };
}

/**
 * The error's class and database code (#1285), never its text: error messages
 * can carry a phone number or the resident's message.
 */
function errorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(code) ? `${name} ${code}` : name;
}

/**
 * Provider-neutral core of inbound message handling: dedupe claim/release
 * plus dispatch into `onMessage`. Takes already-extracted, canonical-shaped
 * messages, so it has no idea whether they came from Meta's JSON payload or
 * Twilio's form-encoded params -- extraction is entirely the caller's job.
 */
export async function processInboundMessages(
  messages: WhatsAppInboundMessage[],
  options: InboundMessageHandlerOptions = {}
): Promise<InboundMessageResult> {
  const store = options.store || createSupabaseProcessedMessageStore();
  let processedCount = 0;
  let duplicateCount = 0;
  let ignoredCount = 0;
  let step = 'claim';
  let failureReason: string | undefined;

  try {
    for (const message of messages) {
      step = 'claim';
      const claim = await store.claim(message.id, new Date().toISOString());

      if (claim === 'duplicate') {
        duplicateCount += 1;
        continue;
      }

      processedCount += 1;

      // Empty text and group messages are ignored; 1:1 media is passed on for the text-only reply (#804).
      if (!message.text && (message.type === 'text' || message.type === 'group')) {
        ignoredCount += 1;
        continue;
      }

      if (options.onMessage) {
        try {
          await options.onMessage(message);
        } catch (error) {
          failureReason = `handle: ${errorClass(error)}`;
          step = 'release';
          await store.release?.(message.id);
          throw error;
        }
      }
    }
  } catch (error) {
    return {
      accepted: false,
      processedCount,
      duplicateCount,
      ignoredCount,
      error: 'Inbound WhatsApp message could not be processed',
      // The handler's error is the cause even when the release after it also fails.
      failureReason: failureReason ?? `${step}: ${errorClass(error)}`,
    };
  }

  return {
    accepted: true,
    processedCount,
    duplicateCount,
    ignoredCount,
  };
}

export async function handleInboundMessage(
  payload: WhatsAppInboundPayload,
  options: InboundMessageHandlerOptions = {}
): Promise<InboundMessageResult> {
  return processInboundMessages(extractWhatsAppMessages(payload), options);
}
