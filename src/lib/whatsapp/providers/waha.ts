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
 * WAHA is a self-hosted WhatsApp Web bridge. This file mirrors
 * `providers/chatmaid.ts`. The endpoints, headers and fields below are read
 * from the WAHA documentation (https://waha.devlike.pro, read 27 Oct 2026).
 * They are NOT yet measured against a live WAHA container, which the sibling
 * Coolify slice provides. Treat every response shape here as assumed until a
 * Stage run confirms it.
 *
 * Decisions, each following from the Chatmaid file:
 *
 * 1. **Connection is checked before every send, with a 30s cache.**
 *    `GET /api/sessions/{session}` must report `status: 'WORKING'`. Any other
 *    status, or a transport error, returns the same `bridge is disconnected`
 *    error shape that `src/lib/notifications/send.ts` already handles for
 *    Chatmaid. A 404 or 422 from a send (WAHA's answer for a missing or
 *    stopped session) is also treated as disconnected and clears the cache.
 *
 * 2. **`sendTemplate` renders to plain text locally.** WAHA has no template
 *    concept. The renderer is the one Chatmaid uses (`renderTemplateToText`).
 *
 * 3. **`idempotencySeed` is accepted and unused.** WAHA has no idempotency key.
 *    The Chatmaid identical-text drop (#842) does not exist here, so a repeated
 *    text is never silently dropped and a retry can send twice.
 *
 * 4. **Files go one request each, after the text.** `mediaUrls` (#871) become
 *    one `POST /api/sendFile` per URL, with the caption on the first file only.
 *
 * The API key is sent only in the `X-Api-Key` header and never appears in a
 * returned error or a log line.
 */

const CONNECTION_CACHE_TTL_MS = 30_000;
const API_KEY_FINGERPRINT_LENGTH = 12;
const WORKING_STATUS = 'WORKING';

interface CachedConnection {
  status: string;
  cachedAt: number;
}

// One entry per (baseUrl, session, api key fingerprint). Keyed by value, so a
// re-resolved config still hits the same entry, and a rotated key does not
// inherit a reading taken under the old key.
const connectionCache = new Map<string, CachedConnection>();

/** A short sha256 prefix of the API key, never the key itself. */
function apiKeyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf8').digest('hex').slice(0, API_KEY_FINGERPRINT_LENGTH);
}

type WahaConnectionConfig = Pick<WahaWhatsAppConfig, 'baseUrl' | 'session' | 'apiKey'>;

function connectionCacheKey(config: WahaConnectionConfig): string {
  return `${config.baseUrl}|${config.session}|${apiKeyFingerprint(config.apiKey)}`;
}

function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type WahaPhoneLookup =
  | { ok: false; httpStatus: number }
  | { ok: true; status: string; phone: string | null };

/**
 * `GET /api/sessions/{session}`, the one read behind the send-time check and
 * the connection test. `phone` is the digits of `me.id` (`2348...@c.us`), or
 * null while the session has no paired handset. Network errors propagate;
 * callers own the "could not reach" message.
 */
export async function lookupWahaPhone(
  config: WahaConnectionConfig,
  fetchImpl: typeof fetch = fetch
): Promise<WahaPhoneLookup> {
  const response = await fetchImpl(`${config.baseUrl}/api/sessions/${encodeURIComponent(config.session)}`, {
    headers: { 'X-Api-Key': config.apiKey },
    cache: 'no-store',
  });
  if (!response.ok) {
    return { ok: false, httpStatus: response.status };
  }

  const body = await safeJson(response);
  const status = typeof body?.status === 'string' ? body.status : 'unknown';
  const meId = (body?.me as Record<string, unknown> | null | undefined)?.id;
  const phone = typeof meId === 'string' ? digitsOf(meId.split('@')[0]) : '';
  return { ok: true, status, phone: phone || null };
}

/** `status` of the session, or 'unknown' when WAHA does not answer with one. */
export async function fetchWahaConnectionStatus(
  config: WahaConnectionConfig,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const lookup = await lookupWahaPhone(config, fetchImpl);
  return lookup.ok ? lookup.status : 'unknown';
}

const LID_LOOKUP_TIMEOUT_MS = 10_000;

/**
 * `GET /api/{session}/lids/{lid}` (#1282): the phone-number id WAHA holds for
 * a hidden `@lid` id. Read from the WAHA docs (https://waha.devlike.pro/docs/how-to/contacts/,
 * 28 Oct 2026): the answer is `{ lid, pn }`, with `pn` null when WAHA knows no
 * number. NOWEB needs its store enabled for this.
 *
 * Returns `pn` only when the answer names the lid that was asked for, else
 * null. A transport error or a non-2xx throws an error that names only the
 * HTTP status (never the lid, the number or the API key).
 */
export async function lookupWahaLidPhone(
  config: WahaConnectionConfig,
  lid: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  // encodeURIComponent turns `@` into `%40`, as the docs ask.
  const response = await fetchImpl(
    `${config.baseUrl}/api/${encodeURIComponent(config.session)}/lids/${encodeURIComponent(lid)}`,
    {
      headers: { 'X-Api-Key': config.apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(LID_LOOKUP_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`WAHA LID lookup failed (HTTP ${response.status})`);
  }

  const body = await safeJson(response);
  return body?.lid === lid && typeof body.pn === 'string' && body.pn.length > 0 ? body.pn : null;
}

const GROUP_READ_TIMEOUT_MS = 15_000;

export interface WahaGroup {
  id: string;
  name: string;
}

export interface WahaGroupParticipant {
  /** The raw WAHA id: `...@c.us` or a hidden `...@lid`. */
  id: string;
  /** `participant`, `admin`, `superadmin`, or `left`. */
  role: string;
}

async function wahaGroupRequest(
  config: WahaConnectionConfig,
  path: string,
  method: 'GET' | 'POST',
  fetchImpl: typeof fetch
): Promise<unknown> {
  const response = await fetchImpl(`${config.baseUrl}/api/${encodeURIComponent(config.session)}${path}`, {
    method,
    headers: { 'X-Api-Key': config.apiKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(GROUP_READ_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Status only: the path carries a group id and the body may carry numbers.
    throw new Error(`WAHA group request failed (HTTP ${response.status})`);
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function groupIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const serialized = (value as { _serialized?: unknown } | null | undefined)?._serialized;
  return typeof serialized === 'string' ? serialized : null;
}

/**
 * `GET /api/{session}/groups?exclude=participants` (#1325): the groups the bot
 * number is in. Read from the WAHA docs (https://waha.devlike.pro/docs/how-to/groups/,
 * 29 Oct 2026), not yet measured on a live container, so the reader accepts a
 * list or an object keyed by group id, and `subject` or `name` for the title.
 * Entries without a `...@g.us` id are dropped.
 */
export async function listWahaGroups(
  config: WahaConnectionConfig,
  fetchImpl: typeof fetch = fetch
): Promise<WahaGroup[]> {
  const body = await wahaGroupRequest(config, '/groups?exclude=participants', 'GET', fetchImpl);
  const entries: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? Object.entries(body as Record<string, unknown>).map(([key, value]) => ({ id: key, ...(value as object) }))
      : [];
  const groups: WahaGroup[] = [];
  for (const entry of entries) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const id = groupIdOf(record.id) ?? groupIdOf(record.JID);
    if (!id || !id.endsWith('@g.us')) continue;
    const name = [record.subject, record.name, record.Name].find((v) => typeof v === 'string' && v.length > 0);
    groups.push({ id, name: (name as string | undefined) ?? id });
  }
  return groups;
}

/**
 * `GET /api/{session}/groups/{groupId}/participants/v2` (#1325): `[{ id, role }]`.
 * There is no phone field; a hidden `@lid` id needs `lookupWahaLidPhone`.
 */
export async function getWahaGroupParticipants(
  config: WahaConnectionConfig,
  groupId: string,
  fetchImpl: typeof fetch = fetch
): Promise<WahaGroupParticipant[]> {
  const body = await wahaGroupRequest(config, `/groups/${encodeURIComponent(groupId)}/participants/v2`, 'GET', fetchImpl);
  if (!Array.isArray(body)) return [];
  const participants: WahaGroupParticipant[] = [];
  for (const entry of body) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const id = groupIdOf(record.id);
    if (id) participants.push({ id, role: typeof record.role === 'string' ? record.role : 'participant' });
  }
  return participants;
}

/**
 * `POST /api/{session}/groups/refresh` (#1325): WAHA re-reads its groups and
 * fills the LID table. The docs warn that calling it often causes
 * `rate-overlimit`, so callers must limit it (the nightly sync does once a day).
 */
export async function refreshWahaGroups(
  config: WahaConnectionConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await wahaGroupRequest(config, '/groups/refresh', 'POST', fetchImpl);
}

const DISCONNECTED_ERROR = 'WAHA bridge is disconnected';

/** Whether the session is `WORKING`, cached for 30s. */
async function isSessionWorking(config: WahaWhatsAppConfig, fetchImpl: typeof fetch): Promise<boolean> {
  const cacheKey = connectionCacheKey(config);
  const now = Date.now();
  const cached = connectionCache.get(cacheKey);
  if (cached && now - cached.cachedAt < CONNECTION_CACHE_TTL_MS) {
    return cached.status === WORKING_STATUS;
  }

  let status: string;
  try {
    status = await fetchWahaConnectionStatus(config, fetchImpl);
  } catch {
    return false;
  }

  // A failed or unreadable check is not cached: the next send re-checks.
  if (status === 'unknown') {
    return false;
  }
  connectionCache.set(cacheKey, { status, cachedAt: now });
  return status === WORKING_STATUS;
}

/** `2348...@c.us`: the digits of the E.164 number plus WAHA's person suffix. */
function toChatId(to: string): string {
  return `${digitsOf(to)}@c.us`;
}

/** The last path segment of the URL, without the query, for the file name WhatsApp shows. */
function fileNameOf(url: string): string {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}

/**
 * The id of a sent message, in the `true_<chatId>_<id>` form `message.ack` carries.
 * The answer's shape depends on the engine and is not in the WAHA docs (#1285):
 * a string `id`, WEBJS's `id._serialized`, or NOWEB's Baileys `key`. Reading
 * only a string `id` made every Stage send read as failed although it was delivered.
 */
function sentMessageId(body: Record<string, unknown> | null, chatId: string): string | null {
  const id = body?.id;
  if (typeof id === 'string' && id.length > 0) return id;
  const serialized = (id as Record<string, unknown> | null | undefined)?._serialized;
  if (typeof serialized === 'string' && serialized.length > 0) return serialized;
  const key = body?.key as Record<string, unknown> | null | undefined;
  if (typeof key?.id === 'string' && key.id.length > 0) return `${key.fromMe === false ? 'false' : 'true'}_${chatId}_${key.id}`;
  return null;
}

type WahaPostResult =
  | { ok: true; messageId: string }
  | { ok: false; result: WhatsAppSendResult };

async function wahaPost(
  config: WahaWhatsAppConfig,
  fetchImpl: typeof fetch,
  path: string,
  payload: Record<string, unknown>
): Promise<WahaPostResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'X-Api-Key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: config.session, ...payload }),
    });
  } catch {
    return { ok: false, result: { success: false, error: 'WAHA provider request failed', retryable: true } };
  }

  // A missing or stopped session (disconnected between the check and the send).
  if (response.status === 404 || response.status === 422) {
    connectionCache.delete(connectionCacheKey(config));
    return { ok: false, result: { success: false, error: DISCONNECTED_ERROR } };
  }

  if (response.status === 429) {
    return { ok: false, result: { success: false, error: 'WAHA rate limit exceeded', retryable: true } };
  }

  if (!response.ok) {
    const body = await safeJson(response);
    const error =
      (typeof body?.message === 'string' && body.message) ||
      (typeof body?.error === 'string' && body.error) ||
      `WAHA request failed (HTTP ${response.status})`;
    return { ok: false, result: { success: false, error, retryable: isRetryableHttpStatus(response.status) } };
  }

  const id = sentMessageId(await safeJson(response), payload.chatId as string);
  if (!id) {
    return {
      ok: false,
      result: { success: false, error: 'WAHA provider returned no message ID', retryable: false },
    };
  }
  return { ok: true, messageId: id };
}

/**
 * `POST /api/sendText` to a group chat (`...@g.us`), for an estate-wide announcement (#1328).
 * Text only. Same connection check and error shapes as a one-to-one send.
 */
export async function sendWahaGroupText(
  config: WahaWhatsAppConfig,
  groupId: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<WhatsAppSendResult> {
  if (!groupId.endsWith('@g.us')) {
    return { success: false, error: 'Not a WhatsApp group id', retryable: false };
  }
  if (!(await isSessionWorking(config, fetchImpl))) {
    return { success: false, error: DISCONNECTED_ERROR };
  }
  const sent = await wahaPost(config, fetchImpl, '/api/sendText', { chatId: groupId, text });
  return sent.ok ? { success: true, messageId: sent.messageId } : sent.result;
}

export function createWahaWhatsAppProvider(
  config: WahaWhatsAppConfig,
  fetchImpl: typeof fetch = fetch
): WhatsAppProvider {
  const post = (path: string, payload: Record<string, unknown>) => wahaPost(config, fetchImpl, path, payload);

  async function sendContent(to: string, content: string, mediaUrls?: string[]): Promise<WhatsAppSendResult> {
    if (!(await isSessionWorking(config, fetchImpl))) {
      return { success: false, error: DISCONNECTED_ERROR };
    }

    const chatId = toChatId(to);
    const files = mediaUrls ?? [];
    let firstMessageId: string | undefined;

    // Text first, then the files. A file-only send (empty text) skips the text request.
    if (content.length > 0 || files.length === 0) {
      const sent = await post('/api/sendText', { chatId, text: content });
      if (!sent.ok) return sent.result;
      firstMessageId = sent.messageId;
    }

    for (const [index, url] of files.entries()) {
      const filename = fileNameOf(url);
      const sent = await post('/api/sendFile', {
        chatId,
        file: { url, mimetype: 'application/pdf', filename },
        ...(index === 0 ? { caption: filename } : {}),
      });
      if (!sent.ok) {
        // An earlier part already went out; a retry would send it twice, so this failure is final.
        return firstMessageId ? { ...sent.result, retryable: false } : sent.result;
      }
      firstMessageId ??= sent.messageId;
    }

    return { success: true, messageId: firstMessageId };
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
