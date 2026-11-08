import type { OverrideLogRecord } from '@/lib/comms-override/types';

export interface WhatsAppTextMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
  /** Distinguishes this send from an identical earlier one (inbound message id). Chatmaid only (#842). */
  idempotencySeed?: string;
  /** Public HTTPS URLs of files to attach, such as a signed PDF URL. Chatmaid only (#871). */
  mediaUrls?: string[];
}

export interface WhatsAppTemplateMessage {
  to: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  /** Distinguishes this send from an identical earlier one (notification queue id). Chatmaid only (#842). */
  idempotencySeed?: string;
}

/** A single-choice poll (#1389). WAHA only: the other providers have no poll send. */
export interface WhatsAppPollMessage {
  to: string;
  /** The question shown above the options. */
  name: string;
  options: string[];
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

/** The file of a WAHA media message (#1455); `url` is null when WAHA did not download it. */
export interface WhatsAppInboundMedia {
  url: string | null;
  mimetype: string | null;
}

export interface WhatsAppInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text: string | null;
  /** WAHA only: set on a 1:1 media message (#1455). */
  media?: WhatsAppInboundMedia;
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
  /** Failed step and error class, safe to log (#1285): `handle: ReplySendError`. */
  failureReason?: string;
}
