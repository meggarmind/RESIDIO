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

  try {
    for (const message of messages) {
      const claim = await store.claim(message.id, new Date().toISOString());

      if (claim === 'duplicate') {
        duplicateCount += 1;
        continue;
      }

      processedCount += 1;

      if (!message.text) {
        ignoredCount += 1;
        continue;
      }

      if (options.onMessage) {
        try {
          await options.onMessage(message);
        } catch (error) {
          await store.release?.(message.id);
          throw error;
        }
      }
    }
  } catch {
    return {
      accepted: false,
      processedCount,
      duplicateCount,
      ignoredCount,
      error: 'Inbound WhatsApp message could not be processed',
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
