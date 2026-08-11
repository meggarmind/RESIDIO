import { getWhatsAppConfig, type WhatsAppConfig } from '@/lib/whatsapp/config';
import type { WhatsAppSendResult, WhatsAppTextMessage } from '@/lib/whatsapp/types';

export interface WhatsAppProvider {
  sendText(message: WhatsAppTextMessage): Promise<WhatsAppSendResult>;
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
}

export function createMetaWhatsAppProvider(
  config: WhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): WhatsAppProvider {
  return {
    async sendText(message) {
      const response = await fetchImpl(
        `${config.graphBaseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.to,
            type: 'text',
            text: {
              preview_url: message.previewUrl ?? false,
              body: message.body,
            },
          }),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `WhatsApp provider request failed (HTTP ${response.status})`,
        };
      }

      const data = (await response.json()) as MetaSendResponse;
      const messageId = data.messages?.[0]?.id;

      if (!messageId) {
        return {
          success: false,
          error: 'WhatsApp provider returned no message ID',
        };
      }

      return { success: true, messageId };
    },
  };
}

export async function sendWhatsAppMessage(
  message: WhatsAppTextMessage,
  provider?: WhatsAppProvider
): Promise<WhatsAppSendResult> {
  const config = getWhatsAppConfig();

  if (!provider && !config) {
    return {
      success: false,
      error: 'WhatsApp service is not configured',
    };
  }

  try {
    return await (provider || createMetaWhatsAppProvider(config!)).sendText(message);
  } catch {
    return {
      success: false,
      error: 'WhatsApp provider request failed',
    };
  }
}
