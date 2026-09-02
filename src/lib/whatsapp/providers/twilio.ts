import type { TwilioWhatsAppConfig } from '@/lib/whatsapp/config';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

interface TwilioSendResponse {
  sid?: string;
}

/**
 * Normalises a phone number into Twilio's `whatsapp:+<E164>` addressing
 * scheme, without double-prefixing a value that already carries a `+` and/or
 * a `whatsapp:` prefix.
 *
 * Inputs seen in practice:
 * - `message.to` is bare, Meta-style (may or may not have a leading `+`).
 * - `config.fromNumber` is stored as E.164 (leading `+`, no `whatsapp:`).
 */
function toTwilioWhatsAppAddress(rawNumber: string): string {
  const withoutWhatsAppPrefix = rawNumber.startsWith('whatsapp:')
    ? rawNumber.slice('whatsapp:'.length)
    : rawNumber;
  const withPlus = withoutWhatsAppPrefix.startsWith('+')
    ? withoutWhatsAppPrefix
    : `+${withoutWhatsAppPrefix}`;

  return `whatsapp:${withPlus}`;
}

function buildBasicAuthHeader(accountSid: string, authToken: string): string {
  const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Builds Twilio's 1-indexed positional `ContentVariables` map, e.g.
 * `['Ada', 'INV-1']` -> `{"1":"Ada","2":"INV-1"}`.
 */
function buildContentVariables(parameters: string[]): string {
  const variables: Record<string, string> = {};
  parameters.forEach((value, index) => {
    variables[String(index + 1)] = value;
  });
  return JSON.stringify(variables);
}

export function createTwilioWhatsAppProvider(
  config: TwilioWhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): WhatsAppProvider {
  const authHeader = buildBasicAuthHeader(config.accountSid, config.authToken);
  const endpoint = `${TWILIO_API_BASE}/Accounts/${config.accountSid}/Messages.json`;

  async function postForm(body: URLSearchParams) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return {
        success: false as const,
        error: `WhatsApp provider request failed (HTTP ${response.status})`,
      };
    }

    const data = (await response.json()) as TwilioSendResponse;
    if (!data.sid) {
      return {
        success: false as const,
        error: 'WhatsApp provider returned no message ID',
      };
    }

    return { success: true as const, messageId: data.sid };
  }

  return {
    async sendText(message) {
      const body = new URLSearchParams({
        To: toTwilioWhatsAppAddress(message.to),
        From: toTwilioWhatsAppAddress(config.fromNumber),
        Body: message.body,
      });

      return postForm(body);
    },
    async sendTemplate(message) {
      const contentSid = config.templateContentSids[message.templateName];
      if (!contentSid) {
        // Do not fall back to sending free text: proactive sends must stay
        // template-gated for WhatsApp compliance.
        return {
          success: false,
          error: `No Twilio Content SID configured for template "${message.templateName}"`,
        };
      }

      // Twilio has no per-send language parameter: the language is baked into
      // the approved Content SID itself, so `message.languageCode` has no
      // Twilio equivalent and is intentionally ignored here.
      const body = new URLSearchParams({
        To: toTwilioWhatsAppAddress(message.to),
        From: toTwilioWhatsAppAddress(config.fromNumber),
        ContentSid: contentSid,
        ContentVariables: buildContentVariables(message.parameters),
      });

      return postForm(body);
    },
  };
}
