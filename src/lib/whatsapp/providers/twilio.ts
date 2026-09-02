import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TwilioWhatsAppConfig } from '@/lib/whatsapp/config';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

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

/**
 * Verifies Twilio's inbound webhook signature.
 *
 * This is NOT the same scheme as Meta's (`signature.ts`): Twilio signs the
 * full request URL plus its POST params, HMAC-SHA1, base64 -- not an
 * HMAC-SHA256 over the raw body. See
 * https://www.twilio.com/docs/usage/security#validating-requests for the
 * canonical description.
 *
 * Algorithm:
 * 1. Start with the full request URL (scheme, host, path, query string).
 * 2. Sort the POST params by key, and for each append the key immediately
 *    followed by its value -- no separators, no delimiters, no encoding.
 * 3. HMAC-SHA1 that string with the Twilio auth token, base64-encode it.
 * 4. Compare to the `X-Twilio-Signature` header in constant time.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  header: string | null
): boolean {
  if (!header || !authToken) {
    return false;
  }

  const signedPayload = Object.keys(params)
    .sort()
    .reduce((payload, key) => payload + key + params[key], url);

  const expected = createHmac('sha1', authToken).update(signedPayload, 'utf8').digest('base64');

  const providedBuffer = Buffer.from(header, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Parses Twilio's inbound WhatsApp webhook form params into the same
 * canonical `WhatsAppInboundMessage` shape the Meta parser produces, so
 * `processInboundMessages` (dedupe, dispatch) is entirely provider-neutral.
 */
export function extractTwilioMessages(params: Record<string, string>): WhatsAppInboundMessage[] {
  const id = params.MessageSid;
  if (!id) {
    return [];
  }

  // Twilio addresses WhatsApp numbers as `whatsapp:+<E164>`. Strip the
  // prefix explicitly here, rather than leaning on a downstream normaliser,
  // so the resulting `from` matches the bare-number shape Meta delivers --
  // identity lookup (matching against a resident's stored phone number) then
  // behaves identically regardless of which provider the message arrived on.
  const from = params.From?.startsWith('whatsapp:') ? params.From.slice('whatsapp:'.length) : params.From;

  if (!from) {
    return [];
  }

  return [
    {
      id,
      from,
      // Twilio's inbound webhook carries no timestamp field (unlike Meta's
      // payload), so synthesise one here, shaped the same way Meta's is:
      // whole seconds since epoch, as a string.
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: params.Body && params.Body.length > 0 ? params.Body : null,
    },
  ];
}
