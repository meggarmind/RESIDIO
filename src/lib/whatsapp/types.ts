import type { OverrideLogRecord } from '@/lib/comms-override/types';

export interface WhatsAppTextMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
  /** Distinguishes this send from an identical earlier one (inbound message id). Chatmaid only (#842). */
  idempotencySeed?: string;
}

export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  /** Distinguishes this send from an identical earlier one (notification queue id). Chatmaid only (#842). */
  idempotencySeed?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Set on failure when the adapter can tell: false = do not retry, true = transient. Absent = unknown. */
  retryable?: boolean;
  /** Set when the communications override redirected or blocked the send (#715). */
  override?: OverrideLogRecord;
}

export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
}

export interface WhatsAppInboundPayload {
  object?: string;
  entry?: readonly {
    changes?: readonly {
      value?: {
        messages?: readonly {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

export interface ProcessedMessageStore {
  claim(messageId: string, receivedAt: string): Promise<'claimed' | 'duplicate'>;
  release?(messageId: string): Promise<void>;
}

export interface InboundMessageHandlerOptions {
  store?: ProcessedMessageStore;
  onMessage?: (message: WhatsAppInboundMessage) => Promise<void>;
}

export interface InboundMessageResult {
  accepted: boolean;
  processedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  error?: string;
}
