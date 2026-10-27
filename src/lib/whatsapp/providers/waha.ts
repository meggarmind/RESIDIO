import { createHash } from 'node:crypto';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';
import { renderTemplateToText } from '@/lib/whatsapp/providers/chatmaid';
import { isRetryableHttpStatus } from '@/lib/whatsapp/retry';
import type {
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';

/**
 * WAHA WhatsApp provider (#1262).
 *
 * WAHA (devlikeapro/waha, NOWEB engine) is a self-hosted WhatsApp Web
 * gateway that runs as its own Coolify application beside Residio. Like
 * Chatmaid it is a QR-paired bridge, so this file mirrors
 * `providers/chatmaid.ts`:
 *
 * 1. **No idempotency key.** WAHA has none, so `idempotencySeed` is accepted
 *    and unused. Chatmaid's identical-text drop (#842) does not exist here:
 *    every call is a new message, and a retried send can arrive twice.
 *
 * 2. **`sendTemplate` renders to plain text locally**, with the same renderer
 *    Chatmaid uses (`renderTemplateToText`), then sends like `sendText`.
 *
 * 3. **The session is checked before every send, with a 30s cache.** Only a
 *    session in status `WORKING` can send; any other status, or a transport
 *    error, fails the send as `WAHA bridge is disconnected`, the same shape
 *    `send.ts` already handles for Chatmaid.
 *
 * The API key is sent as `X-Api-Key` and never appears in a returned error
 * or a log line.
 */

const WAHA_MAX_CONTENT_LENGTH = 4096;
const CONNECTION_CACHE_TTL_MS = 30_000;
const API_KEY_FINGERPRINT_LENGTH = 12;
const DISCONNECTED = 'WAHA bridge is disconnected';

interface CachedSession {
  status: string;
  cachedAt: number;
}

// One entry per (baseUrl, session, api key fingerprint), keyed by value so a
// re-resolved config object still hits the same entry.
const sessionCache = new Map<string, CachedSession>();

/** A short sha256 prefix of the key, never the key, so a rotated key re-checks the session. */
function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex').slice(0, API_KEY_FINGERPRINT_LENGTH);
}

function sessionCacheKey(config: WahaWhatsAppConfig): string {
  return `${config.baseUrl}|${config.session}|${apiKeyFingerprint(config.apiKey)}`;
}

function authHeaders(config: Pick<WahaWhatsAppConfig, 'apiKey'>): Record<string, string> {
  return { 'X-Api-Key': config.apiKey };
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** WAHA addresses a 1:1 chat as `<digits>@c.us`. */
export function toWahaChatId(phone: string): string {
  return `${digitsOnly(phone)}@c.us`;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The message id from a send response. WAHA returns `id` as a string in its
 * documented examples; the WEBJS `{ _serialized }` and NOWEB `key` shapes are
 * read defensively so a send is never logged as failed when it went out.
 * The `key` form is serialised as `<fromMe>_<chat>@c.us_<id>`, the shape WAHA
 * uses for `message.ack` ids, so the ack finds the stored send.
 */
function extractMessageId(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  if (typeof body.id === 'string' && body.id.length > 0) return body.id;
  const serialized = asRecord(body.id)?._serialized;
  if (typeof serialized === 'string' && serialized.length > 0) return serialized;
  const key = asRecord(body.key);
  if (key && typeof key.id === 'string' && typeof key.remoteJid === 'string') {
    const chat = key.remoteJid.replace(/@s\.whatsapp\.net$/, '@c.us');
    return `${key.fromMe === true}_${chat}_${key.id}`;
  }
  return null;
}

/** A readable error from a WAHA error body, never echoing request headers. */
function extractError(body: Record<string, unknown> | null, status: number): string {
  const message = body?.message ?? body?.error;
  if (typeof message === 'string' && message.length > 0) return `WAHA request failed: ${message.slice(0, 300)}`;
  if (Array.isArray(message) && message.length > 0) return `WAHA request failed: ${message.map(String).join('; ').slice(0, 300)}`;
  return `WAHA request failed (HTTP ${status})`;
}

/**
 * `GET {baseUrl}/api/sessions/{session}`: the session object, or null when
 * WAHA answers non-2xx. Network errors propagate; callers own the message.
 */
async function fetchSession(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'apiKey' | 'session'>,
  fetchImpl: typeof fetch
): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(`${config.baseUrl}/api/sessions/${encodeURIComponent(config.session)}`, {
    headers: authHeaders(config),
    cache: 'no-store',
  });
  return response.ok ? await safeJson(response) : null;
}

/** The session's `status` (`WORKING`, `SCAN_QR_CODE`, ...), or 'unknown' when WAHA does not say. */
export async function fetchWahaConnectionStatus(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'apiKey' | 'session'>,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const session = await fetchSession(config, fetchImpl);
  return typeof session?.status === 'string' ? session.status : 'unknown';
}

export type WahaPhoneLookup =
  | { ok: false }
  | { ok: true; status: string; pairedNumber: string | null };

/**
 * The number paired to the session (`me.id`, digits only) and its status,
 * for the connection test (#843). Network errors propagate.
 */
export async function lookupWahaPhone(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'apiKey' | 'session'>,
  fetchImpl: typeof fetch = fetch
): Promise<WahaPhoneLookup> {
  const session = await fetchSession(config, fetchImpl);
  if (!session) return { ok: false };
  const meId = asRecord(session.me)?.id;
  const pairedNumber = typeof meId === 'string' ? digitsOnly(meId.split('@')[0]) || null : null;
  return { ok: true, status: typeof session.status === 'string' ? session.status : 'unknown', pairedNumber };
}

async function resolveSession(config: WahaWhatsAppConfig, fetchImpl: typeof fetch): Promise<boolean> {
  const cacheKey = sessionCacheKey(config);
  const now = Date.now();
  const cached = sessionCache.get(cacheKey);
  if (cached && now - cached.cachedAt < CONNECTION_CACHE_TTL_MS) {
    return cached.status === 'WORKING';
  }

  let status: string;
  try {
    status = await fetchWahaConnectionStatus(config, fetchImpl);
  } catch {
    // A transport error is not cached: the next send re-checks.
    return false;
  }
  sessionCache.set(cacheKey, { status, cachedAt: now });
  return status === 'WORKING';
}

export function createWahaWhatsAppProvider(
  config: WahaWhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): WhatsAppProvider {
  async function post(path: string, body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { success: false, error: 'WAHA provider request failed', retryable: true };
    }

    const json = await safeJson(response);
    if (!response.ok) {
      return {
        success: false,
        error: response.status === 429 ? 'WAHA rate limit exceeded' : extractError(json, response.status),
        retryable: isRetryableHttpStatus(response.status),
      };
    }

    const messageId = extractMessageId(json);
    if (!messageId) {
      return { success: false, error: 'WAHA provider returned no message ID', retryable: false };
    }
    return { success: true, messageId };
  }

  async function sendContent(to: string, content: string, mediaUrls?: string[]): Promise<WhatsAppSendResult> {
    if (content.length > WAHA_MAX_CONTENT_LENGTH) {
      return {
        success: false,
        error: `WhatsApp message exceeds the ${WAHA_MAX_CONTENT_LENGTH}-character limit (${content.length} characters)`,
        retryable: false,
      };
    }

    if (!(await resolveSession(config, fetchImpl))) {
      return { success: false, error: DISCONNECTED };
    }

    const chatId = toWahaChatId(to);
    const textResult = await post('/api/sendText', { session: config.session, chatId, text: content });
    if (!textResult.success || !mediaUrls?.length) return textResult;

    // Text first, then one sendFile per URL (#871). The first file carries the
    // text as its caption, as Chatmaid's single media send does.
    for (const [index, url] of mediaUrls.entries()) {
      const fileResult = await post('/api/sendFile', {
        session: config.session,
        chatId,
        file: { url, mimetype: 'application/pdf', filename: fileNameFromUrl(url, index) },
        caption: index === 0 ? content : undefined,
      });
      if (!fileResult.success) return fileResult;
    }
    return textResult;
  }

  return {
    async sendText(message: WhatsAppTextMessage) {
      return sendContent(message.to, message.body, message.mediaUrls);
    },
    async sendTemplate(message: WhatsAppTemplateMessage) {
      const content = await renderTemplateToText(message.templateName, message.parameters);
      return sendContent(message.to, content);
    },
  };
}

/** The last path segment of a (signed) URL, or a numbered fallback. */
function fileNameFromUrl(url: string, index: number): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    if (name) return name;
  } catch {
    // Fall through to the numbered name.
  }
  return `document-${index + 1}.pdf`;
}
