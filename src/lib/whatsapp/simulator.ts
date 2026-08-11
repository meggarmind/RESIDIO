import { createInMemoryProcessedMessageStore, handleInboundMessage } from './inbound';
import type {
  InboundMessageResult,
  WhatsAppInboundMessage,
  WhatsAppInboundPayload,
  WhatsAppTextMessage,
} from './types';

export interface WhatsAppSimulator {
  received: WhatsAppInboundMessage[];
  sent: WhatsAppTextMessage[];
  receive(payload: WhatsAppInboundPayload): Promise<InboundMessageResult>;
  send(message: WhatsAppTextMessage): Promise<{ success: true; messageId: string }>;
}

export function createWhatsAppSimulator(): WhatsAppSimulator {
  const received: WhatsAppInboundMessage[] = [];
  const sent: WhatsAppTextMessage[] = [];
  const store = createInMemoryProcessedMessageStore();

  return {
    received,
    sent,
    receive(payload) {
      return handleInboundMessage(payload, {
        store,
        onMessage: async (message) => {
          received.push(message);
        },
      });
    },
    async send(message) {
      sent.push(message);
      return { success: true, messageId: `simulated-${sent.length}` };
    },
  };
}
