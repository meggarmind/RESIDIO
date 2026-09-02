import { getWhatsAppConfig, type MetaWhatsAppConfig } from '@/lib/whatsapp/config';
import type {
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';

export interface WhatsAppProvider {
  sendText(message: WhatsAppTextMessage): Promise<WhatsAppSendResult>;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
}

export function createMetaWhatsAppProvider(
  config: MetaWhatsAppConfig,
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
    async sendTemplate(message) {
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
            type: 'template',
            template: {
              name: message.templateName,
              language: { code: message.languageCode },
              components: message.parameters.length > 0
                ? [{
                    type: 'body',
                    parameters: message.parameters.map((text) => ({ type: 'text', text })),
                  }]
                : undefined,
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
      return messageId
        ? { success: true, messageId }
        : { success: false, error: 'WhatsApp provider returned no message ID' };
    },
  };
}

export async function sendWhatsAppMessage(
  message: WhatsAppTextMessage,
  provider?: WhatsAppProvider
): Promise<WhatsAppSendResult> {
  const config = await getWhatsAppConfig();

  if (!provider && !config) {
    return {
      success: false,
      error: 'WhatsApp service is not configured',
    };
  }

  if (!provider && config?.provider !== 'meta') {
    return { success: false, error: 'WhatsApp service is not configured' };
  }

  try {
    return await (provider || createMetaWhatsAppProvider(config as MetaWhatsAppConfig)).sendText(message);
  } catch {
    return {
      success: false,
      error: 'WhatsApp provider request failed',
    };
  }
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage,
  provider?: WhatsAppProvider
): Promise<WhatsAppSendResult> {
  const config = await getWhatsAppConfig();
  if (!provider && !config) {
    return { success: false, error: 'WhatsApp service is not configured' };
  }

  if (!provider && config?.provider !== 'meta') {
    return { success: false, error: 'WhatsApp service is not configured' };
  }

  try {
    return await (provider || createMetaWhatsAppProvider(config as MetaWhatsAppConfig)).sendTemplate(message);
  } catch {
    return { success: false, error: 'WhatsApp provider request failed' };
  }
}
