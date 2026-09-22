import { createHash } from 'node:crypto';
import type { ChatmaidWhatsAppConfig } from '@/lib/whatsapp/config';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import type {
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';

/**
 * Chatmaid WhatsApp provider (#401).
 *
 * Chatmaid is a QR-paired WhatsApp Web bridge, not Meta's Cloud API. This
 * file mirrors the shape of `providers/twilio.ts`, but every behaviour below
 * was MEASURED against the live Chatmaid API on 2026-09-20/21 (see issue
 * #401's "Measured API reference"), not read from Chatmaid's own docs, which
 * are wrong or silent on several of these points.
 *
 * Three load-bearing decisions, each a direct consequence of a measured
 * failure mode:
 *
 * 1. **Idempotency key = sha256(fromNumber|to|content), never a domain id.**
 *    Replaying Chatmaid's `idempotencyKey` with an unchanged body correctly
 *    dedupes. Replaying the SAME key with a DIFFERENT body returns `201`
 *    carrying the ORIGINAL message and silently drops the new one -- no
 *    `409`, no error. An adapter keyed on e.g. an invoice id would drop
 *    every corrected message while logging success. Hashing the body itself
 *    means a genuinely different message always gets a different key.
 *
 * 2. **`sendTemplate` renders to plain text locally.** Chatmaid has no
 *    template/content-SID concept -- there is nothing to call. The
 *    `TEMPLATE_RENDERERS` map below turns the same `(templateName,
 *    parameters)` pairs the Meta/Twilio providers receive into a plain-text
 *    rendering, then sends it exactly like `sendText`. This means Chatmaid
 *    sends are not template-gated the way Meta's are, which is fine --
 *    Chatmaid is free-text-capable by design and carries no WhatsApp
 *    template-approval requirement to violate.
 *
 * 3. **Connection is checked before every send, with a 30s cache.** Chatmaid's
 *    sandbox environment returns `201` even when the paired handset is
 *    disconnected; only production returns `404`. The sandbox test suite
 *    structurally cannot exercise this path, so the check here is the only
 *    defence. A `404` from the send call itself is ALSO treated as
 *    disconnected (belt and braces for the gap between the check and the
 *    send landing on Chatmaid's side), and invalidates the cache so the next
 *    attempt re-resolves rather than trusting a stale "connected" reading.
 *
 * The API key is never included in any returned error or log line -- errors
 * surface only the envelope's `error`/`message` fields.
 */

const CHATMAID_MAX_CONTENT_LENGTH = 4096;
const CHATMAID_MAX_IDEMPOTENCY_KEY_LENGTH = 64;
const CONNECTION_CACHE_TTL_MS = 30_000;

interface ChatmaidPhoneNumberEntry {
  id: string;
  number: string;
}

interface CachedConnection {
  phoneId: string;
  connectionStatus: string;
  cachedAt: number;
}

// Module-scope cache: at most one entry per (baseUrl, fromNumber, api key
// fingerprint) triple, so a batch of sends against the same estate's
// Chatmaid config does not re-check connection health on every message.
// Keyed by value rather than by config object identity so config
// re-resolution (e.g. after cache invalidation elsewhere) still hits the
// same cache entry.
const connectionCache = new Map<string, CachedConnection>();

/**
 * A short sha256 prefix of the API key, never the key itself, folded into
 * the cache key alongside `baseUrl|fromNumber`. Without this, rotating from
 * a test key to a live key for the same handset (same `fromNumber`; same
 * `baseUrl` -- both environments share one host, see the file docblock)
 * would keep serving a `connected`/`disconnected` reading resolved under
 * the OLD key for up to 30s, which is exactly the test/live promotion trap
 * the rest of this file is built around avoiding.
 */
const API_KEY_FINGERPRINT_LENGTH = 12;

function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex').slice(0, API_KEY_FINGERPRINT_LENGTH);
}

function connectionCacheKey(config: ChatmaidWhatsAppConfig): string {
  return `${config.baseUrl}|${config.fromNumber}|${apiKeyFingerprint(config.apiKey)}`;
}

/**
 * Digits-only comparison so `+2348000000000`, `2348000000000` and any other
 * formatting Chatmaid's dashboard happens to use for the same handset all
 * match. Chatmaid phone ids are environment-scoped (different in test vs.
 * live for the same handset), which is exactly why config keys on E.164
 * rather than the id -- this normalisation is what makes that comparison
 * work regardless of how Chatmaid formats the number it returns.
 */
function normalizePhoneForMatch(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * `GET /v1/phone-numbers` is undocumented in its exact response shape.
 * `GET /v1/messages` (documented) nests as `data.data[]` + `data.pagination`,
 * differing from the flat `data` of single-resource reads, so this defends
 * against both a flat array under `data` and a nested `data.data` array.
 */
function extractPhoneNumberEntries(body: unknown): ChatmaidPhoneNumberEntry[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const container = body as Record<string, unknown>;
  const rawList = Array.isArray(container.data)
    ? container.data
    : Array.isArray((container.data as Record<string, unknown> | undefined)?.data)
      ? ((container.data as Record<string, unknown>).data as unknown[])
      : Array.isArray(body)
        ? (body as unknown[])
        : [];

  return rawList
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id ?? ''),
      number: String(entry.e164 ?? entry.phoneNumber ?? entry.number ?? entry.msisdn ?? ''),
    }))
    .filter((entry) => entry.id && entry.number);
}

function extractConnectionStatus(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return 'unknown';
  }
  const container = body as Record<string, unknown>;
  if (typeof container.connectionStatus === 'string') {
    return container.connectionStatus;
  }
  const nested = container.data;
  if (nested && typeof nested === 'object') {
    const nestedStatus = (nested as Record<string, unknown>).connectionStatus;
    if (typeof nestedStatus === 'string') {
      return nestedStatus;
    }
  }
  return 'unknown';
}

/**
 * Resolves whether `config.fromNumber` is currently connected, caching the
 * result (and the resolved dashboard phone id, needed only for the status
 * lookup itself -- sends address by E.164, never by this id) for 30s.
 */
async function resolveConnection(
  config: ChatmaidWhatsAppConfig,
  fetchImpl: typeof fetch
): Promise<{ ok: true; phoneId: string } | { ok: false; error: string }> {
  const cacheKey = connectionCacheKey(config);
  const now = Date.now();
  const cached = connectionCache.get(cacheKey);
  if (cached && now - cached.cachedAt < CONNECTION_CACHE_TTL_MS) {
    if (cached.connectionStatus !== 'connected') {
      return { ok: false, error: 'Chatmaid bridge is disconnected' };
    }
    return { ok: true, phoneId: cached.phoneId };
  }

  let listResponse: Response;
  try {
    listResponse = await fetchImpl(`${config.baseUrl}/v1/phone-numbers`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  if (!listResponse.ok) {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  const entries = extractPhoneNumberEntries(await safeJson(listResponse));
  const target = normalizePhoneForMatch(config.fromNumber);
  const match = entries.find((entry) => normalizePhoneForMatch(entry.number) === target);

  if (!match) {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  let statusResponse: Response;
  try {
    statusResponse = await fetchImpl(`${config.baseUrl}/v1/phone-numbers/${match.id}/status`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  if (!statusResponse.ok) {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  const connectionStatus = extractConnectionStatus(await safeJson(statusResponse));
  connectionCache.set(cacheKey, { phoneId: match.id, connectionStatus, cachedAt: now });

  if (connectionStatus !== 'connected') {
    return { ok: false, error: 'Chatmaid bridge is disconnected' };
  }

  return { ok: true, phoneId: match.id };
}

function invalidateConnectionCache(config: ChatmaidWhatsAppConfig): void {
  connectionCache.delete(connectionCacheKey(config));
}

/**
 * sha256 hex of `fromNumber|to|content`, which is already exactly 64 hex
 * characters -- Chatmaid's `idempotencyKey` cap -- so the `.slice()` below
 * is a defensive no-op rather than lossy truncation. Keyed on the message
 * body (see file docblock point 1), never on a domain id such as an invoice
 * or notification-queue id.
 */
function buildIdempotencyKey(fromNumber: string, to: string, content: string): string {
  const hash = createHash('sha256').update(`${fromNumber}|${to}|${content}`, 'utf8').digest('hex');
  return hash.slice(0, CHATMAID_MAX_IDEMPOTENCY_KEY_LENGTH);
}

/**
 * Chatmaid has no template concept (file docblock point 2). Each renderer
 * takes the same positional `parameters` the Meta/Twilio Content templates
 * receive (see `src/lib/whatsapp/outbound.ts` for how each array is built)
 * and produces a plain-text equivalent.
 */
const TEMPLATE_RENDERERS: Record<string, (parameters: string[]) => string> = {
  // parameters: [residentName, invoiceNumber, amount, dueDate]
  invoice_reminder: ([residentName, invoiceNumber, amount, dueDate]) =>
    `Hi ${residentName || 'there'}, invoice ${invoiceNumber || ''} for ${amount || ''} is due ${
      dueDate || 'soon'
    }. Please make payment at your earliest convenience.`,
  // parameters: [residentName, amount, paymentDate, referenceNumber]
  payment_received: ([residentName, amount, paymentDate, referenceNumber]) =>
    `Hi ${residentName || 'there'}, we've received your payment of ${amount || ''} on ${
      paymentDate || ''
    } (Ref: ${referenceNumber || 'Not provided'}). Thank you.`,
  // parameters: [title, summary]
  announcement: ([title, summary]) => `${title || 'Announcement'}\n\n${summary || ''}`,
};

function renderTemplateToText(templateName: string, parameters: string[]): string {
  const renderer = TEMPLATE_RENDERERS[templateName];
  if (renderer) {
    return renderer(parameters);
  }
  // Unmapped template: degrade to a readable join rather than throwing, so
  // an unexpected template name still sends something intelligible.
  return parameters.length > 0 ? parameters.join(' ') : templateName;
}

export function createChatmaidWhatsAppProvider(
  config: ChatmaidWhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): WhatsAppProvider {
  async function sendContent(to: string, content: string): Promise<WhatsAppSendResult> {
    if (content.length > CHATMAID_MAX_CONTENT_LENGTH) {
      return {
        success: false,
        error: `WhatsApp message exceeds Chatmaid's ${CHATMAID_MAX_CONTENT_LENGTH}-character limit (${content.length} characters)`,
      };
    }

    const connection = await resolveConnection(config, fetchImpl);
    if (!connection.ok) {
      return { success: false, error: connection.error };
    }

    const idempotencyKey = buildIdempotencyKey(config.fromNumber, to, content);

    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}/v1/messages/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromPhoneId: config.fromNumber,
          to,
          content,
          idempotencyKey,
        }),
      });
    } catch {
      return { success: false, error: 'Chatmaid provider request failed' };
    }

    if (response.status === 404) {
      // Production's disconnected-handset signature (file docblock point 3).
      invalidateConnectionCache(config);
      return { success: false, error: 'Chatmaid bridge is disconnected' };
    }

    if (response.status === 429) {
      const body = await safeJson(response);
      const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : undefined;
      return {
        success: false,
        error:
          retryAfter !== undefined
            ? `Chatmaid rate limit exceeded, retry after ${retryAfter}s`
            : 'Chatmaid rate limit exceeded',
      };
    }

    if (!response.ok) {
      const body = await safeJson(response);
      const messages = Array.isArray(body?.message) ? (body?.message as unknown[]) : [];
      const error =
        (typeof body?.error === 'string' && body.error) ||
        (messages.length > 0 ? messages.map(String).join('; ') : null) ||
        `Chatmaid request failed (HTTP ${response.status})`;
      return { success: false, error };
    }

    const body = await safeJson(response);
    const nestedData = body?.data as Record<string, unknown> | undefined;
    const messageId = (nestedData?.id ?? body?.id) as string | undefined;
    if (!messageId) {
      return { success: false, error: 'Chatmaid provider returned no message ID' };
    }

    return { success: true, messageId: String(messageId) };
  }

  return {
    async sendText(message: WhatsAppTextMessage) {
      return sendContent(message.to, message.body);
    },
    async sendTemplate(message: WhatsAppTemplateMessage) {
      const content = renderTemplateToText(message.templateName, message.parameters);
      return sendContent(message.to, content);
    },
  };
}
