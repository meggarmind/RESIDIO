import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';
import { wahaMessageToInbound } from '@/lib/whatsapp/providers/waha-inbound';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

/**
 * Inbound reconciliation for WAHA (#1262), mirroring `chatmaid-reconcile.ts` (#511).
 *
 * A message WAHA received but could not deliver by webhook (endpoint down
 * during a deploy, or retries spent) is read from WAHA's message store,
 * `GET /api/{session}/chats/all/messages`, and handed to the same handler the
 * webhook uses. The WAHA message `id` is the same value in both, so the
 * existing `whatsapp_processed_messages` claim/release dedupe already stops a
 * message the webhook handled from being answered again. No cursor is kept:
 * that table is the record of what has been handled, and a second record could
 * drift from it and skip a message.
 *
 * ASSUMED, NOT MEASURED: the endpoint, its `filter.*` query parameters and the
 * message fields are read from the WAHA documentation (27 Oct 2026). The store
 * read needs the WAHA engine's message store to be enabled; confirm both on the
 * first Stage run. A run is bounded by a 24 hour window and a page cap.
 */

/** Only messages received within this window are reconciled; older claims may already be purged. */
export const WAHA_RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WAHA_RECONCILE_PAGE_LIMIT = 50;
/** Hard cap on API calls per run: at most MAX_PAGES * PAGE_LIMIT messages are looked at. */
export const WAHA_RECONCILE_MAX_PAGES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export interface WahaReconcileSummary {
  /** Messages inside the window that were looked at. */
  checked: number;
  /** Already claimed, so the webhook (or an earlier run) handled them. */
  alreadyHandled: number;
  /** Claimed now and answered by this run. */
  replayed: number;
  /** Groups, handset sends, hidden ids, and messages outside the window or without a usable id. */
  skipped: number;
  /** Claimed but left unanswered because an admin took over the conversation. */
  paused: number;
  pages: number;
  /** A further full page may have existed beyond the page cap. */
  truncated: boolean;
}

export type WahaReconcileResult =
  | { ok: true; summary: WahaReconcileSummary }
  | { ok: false; summary: WahaReconcileSummary; error: string };

export interface WahaReconcileDeps {
  handle?: typeof processChatmaidMessages;
  now?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * One page of the store read. Errors name only the HTTP status, never the
 * request headers (the API key). A timeout rejects with the platform's timeout
 * error, which also carries no header.
 */
async function fetchWahaMessagesPage(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'session' | 'apiKey'>,
  offset: number,
  sinceUnixSeconds: number,
  fetchImpl: typeof fetch
): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    limit: String(WAHA_RECONCILE_PAGE_LIMIT),
    offset: String(offset),
    downloadMedia: 'false',
    'filter.fromMe': 'false',
    'filter.timestamp.gte': String(sinceUnixSeconds),
  });
  const response = await fetchImpl(
    `${config.baseUrl}/api/${encodeURIComponent(config.session)}/chats/all/messages?${query.toString()}`,
    {
      headers: { 'X-Api-Key': config.apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`WAHA message list failed (HTTP ${response.status})`);
  }

  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new Error('WAHA message list returned an unexpected shape');
  }
  return body.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
}

export async function reconcileWahaInbound(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'session' | 'apiKey'>,
  fetchImpl: typeof fetch = fetch,
  deps: WahaReconcileDeps = {}
): Promise<WahaReconcileResult> {
  const handle = deps.handle ?? processChatmaidMessages;
  const sinceUnixSeconds = Math.floor(((deps.now ?? Date.now()) - WAHA_RECONCILE_WINDOW_MS) / 1000);

  const summary: WahaReconcileSummary = {
    checked: 0,
    alreadyHandled: 0,
    replayed: 0,
    skipped: 0,
    paused: 0,
    pages: 0,
    truncated: false,
  };
  // Keyed by id: a message arriving between two page reads shifts the offsets and can repeat one.
  const candidates = new Map<string, WhatsAppInboundMessage>();

  for (let page = 1; page <= WAHA_RECONCILE_MAX_PAGES; page += 1) {
    const items = await fetchWahaMessagesPage(config, (page - 1) * WAHA_RECONCILE_PAGE_LIMIT, sinceUnixSeconds, fetchImpl);
    summary.pages = page;

    for (const item of items) {
      const message = wahaMessageToInbound(item);
      const timestamp = typeof item.timestamp === 'number' ? item.timestamp : NaN;
      // The server filters on the window; this also drops a message it let through, or one with no usable time.
      if (!message || !Number.isFinite(timestamp) || timestamp < sinceUnixSeconds) {
        summary.skipped += 1;
        continue;
      }
      candidates.set(message.id, message);
    }

    if (items.length < WAHA_RECONCILE_PAGE_LIMIT) {
      break;
    }
    summary.truncated = page === WAHA_RECONCILE_MAX_PAGES;
  }

  summary.checked = candidates.size;
  // Oldest first, so replies go out in the order the residents wrote.
  const messages = [...candidates.values()].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  if (messages.length === 0) {
    return { ok: true, summary };
  }

  const { result, pausedCount } = await handle(messages);
  summary.alreadyHandled = result.duplicateCount;
  summary.paused = pausedCount;
  summary.skipped += result.ignoredCount;
  summary.replayed = result.processedCount - result.ignoredCount - pausedCount;

  return result.accepted
    ? { ok: true, summary }
    : { ok: false, summary, error: result.error ?? 'Inbound reconciliation could not be processed' };
}
