import type { ChatmaidWhatsAppConfig } from '@/lib/whatsapp/config';
import { extractChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-inbound';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';

/**
 * Inbound reconciliation for Chatmaid (#511).
 *
 * A message Chatmaid recorded but could not deliver by webhook (endpoint down
 * during a deploy, or all 3 retries spent) is fetched from
 * `GET /v1/messages/inbound` and handed to the same handler the webhook uses.
 * Verified on Stage 2026-10-21: the `inmsg_...` id there equals the webhook's
 * `messageId`, so the existing `whatsapp_processed_messages` claim/release
 * dedupe already stops a message the webhook handled from being answered
 * again. No separate cursor is kept: that table is the record of what has been
 * handled, and a second record could drift from it and skip a message.
 *
 * The endpoint is undocumented and has no server-side cursor (only `page` and
 * `limit`), newest first. A run is bounded by a time window and a page cap.
 */

/** Only messages received within this window are reconciled; older claims may already be purged. */
export const CHATMAID_RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CHATMAID_RECONCILE_PAGE_LIMIT = 50;
/** Hard cap on API calls per run: at most MAX_PAGES * PAGE_LIMIT messages are looked at. */
export const CHATMAID_RECONCILE_MAX_PAGES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export interface ChatmaidInboundPage {
  items: Record<string, unknown>[];
  totalPages: number;
}

export interface ChatmaidReconcileSummary {
  /** Messages inside the window that were looked at. */
  checked: number;
  /** Already claimed, so the webhook (or an earlier run) handled them. */
  alreadyHandled: number;
  /** Claimed now and answered by this run. */
  replayed: number;
  /** Groups, events, and messages outside the window or without a usable id/time. */
  ignored: number;
  /** Claimed but left unanswered because an admin took over the conversation. */
  paused: number;
  pages: number;
  /** More messages were inside the window than the page cap allowed this run to read. */
  truncated: boolean;
}

/**
 * Chatmaid refused the key (401/403). Retrying in five minutes does not fix it,
 * so the cron logs it and answers 200 rather than alerting every run (#1268).
 */
export class ChatmaidAccessDeniedError extends Error {
  constructor(readonly status: number, reason: string | null) {
    super(`Chatmaid inbound list failed (HTTP ${status})${reason ? `: ${reason}` : ''}`);
    this.name = 'ChatmaidAccessDeniedError';
  }
}

const MAX_REASON_LENGTH = 120;

/** Chatmaid's own short `message`/`error` text, trimmed and with the key scrubbed. */
async function readDeniedReason(response: Response, apiKey: string): Promise<string | null> {
  const body = asRecord(await response.json().catch(() => null));
  const raw = [body?.message, body?.error, asRecord(body?.error)?.message].find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
  if (!raw) return null;
  const scrubbed = apiKey ? raw.split(apiKey).join('[redacted]') : raw;
  return scrubbed.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * One page of `GET /v1/messages/inbound`. Shape (observed, not documented):
 * `{ success, data: { data: [...], pagination: { page, limit, total, totalPages } } }`.
 * Errors name only the HTTP status, never the request headers (the API key).
 */
export async function fetchChatmaidInboundPage(
  config: Pick<ChatmaidWhatsAppConfig, 'baseUrl' | 'apiKey'>,
  page: number,
  limit: number,
  fetchImpl: typeof fetch = fetch
): Promise<ChatmaidInboundPage> {
  const response = await fetchImpl(`${config.baseUrl}/v1/messages/inbound?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new ChatmaidAccessDeniedError(response.status, await readDeniedReason(response, config.apiKey));
  }
  if (!response.ok) {
    throw new Error(`Chatmaid inbound list failed (HTTP ${response.status})`);
  }

  const data = asRecord(asRecord(await response.json().catch(() => null))?.data);
  if (!data || !Array.isArray(data.data)) {
    throw new Error('Chatmaid inbound list returned an unexpected shape');
  }

  const totalPages = Number(asRecord(data.pagination)?.totalPages);
  return {
    items: data.data.map(asRecord).filter((item): item is Record<string, unknown> => item !== null),
    totalPages: Number.isFinite(totalPages) ? totalPages : page,
  };
}

export interface ReconcileDeps {
  fetchPage?: typeof fetchChatmaidInboundPage;
  handle?: typeof processChatmaidMessages;
  now?: number;
}

export type ChatmaidReconcileResult =
  | { ok: true; summary: ChatmaidReconcileSummary }
  | { ok: false; summary: ChatmaidReconcileSummary; error: string };

export async function reconcileChatmaidInbound(
  config: Pick<ChatmaidWhatsAppConfig, 'baseUrl' | 'apiKey'>,
  deps: ReconcileDeps = {}
): Promise<ChatmaidReconcileResult> {
  const fetchPage = deps.fetchPage ?? fetchChatmaidInboundPage;
  const handle = deps.handle ?? processChatmaidMessages;
  const cutoff = (deps.now ?? Date.now()) - CHATMAID_RECONCILE_WINDOW_MS;

  const summary: ChatmaidReconcileSummary = {
    checked: 0,
    alreadyHandled: 0,
    replayed: 0,
    ignored: 0,
    paused: 0,
    pages: 0,
    truncated: false,
  };
  // Webhook-shaped, so extractChatmaidMessages applies the same group/media rules as the webhook.
  const candidates: Record<string, unknown>[] = [];

  for (let page = 1; page <= CHATMAID_RECONCILE_MAX_PAGES; page += 1) {
    const { items, totalPages } = await fetchPage(config, page, CHATMAID_RECONCILE_PAGE_LIMIT);
    summary.pages = page;
    let reachedCutoff = false;

    for (const item of items) {
      const id = typeof item.id === 'string' ? item.id : '';
      const receivedAt = typeof item.receivedAt === 'string' ? Date.parse(item.receivedAt) : NaN;

      // Newest first: the first message older than the window ends the scan.
      if (Number.isFinite(receivedAt) && receivedAt < cutoff) {
        reachedCutoff = true;
        continue;
      }
      // `chatmaid-event` ids are webhook event keys in the processed-message table, never messages.
      if (!id || id.startsWith('chatmaid-event') || !Number.isFinite(receivedAt)) {
        summary.ignored += 1;
        continue;
      }

      candidates.push({ ...item, messageId: id, timestamp: item.receivedAt });
    }

    if (reachedCutoff || page >= totalPages || items.length === 0) {
      break;
    }
    summary.truncated = page === CHATMAID_RECONCILE_MAX_PAGES;
  }

  summary.checked = candidates.length;
  // Oldest first, so replies go out in the order the residents wrote.
  const messages = extractChatmaidMessages({ data: candidates.reverse() });
  // extractChatmaidMessages drops entries without a usable sender.
  summary.ignored += candidates.length - messages.length;
  if (messages.length === 0) {
    return { ok: true, summary };
  }

  const { result, pausedCount } = await handle(messages);
  summary.alreadyHandled = result.duplicateCount;
  summary.paused = pausedCount;
  summary.ignored += result.ignoredCount;
  summary.replayed = result.processedCount - result.ignoredCount - pausedCount;

  return result.accepted
    ? { ok: true, summary }
    : { ok: false, summary, error: result.error ?? 'Inbound reconciliation could not be processed' };
}
