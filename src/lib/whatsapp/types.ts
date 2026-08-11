export interface WhatsAppTextMessage {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
