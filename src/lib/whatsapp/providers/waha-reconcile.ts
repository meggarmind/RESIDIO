import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import type { ChatmaidReconcileSummary } from '@/lib/whatsapp/providers/chatmaid-reconcile';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';
import { wahaMessageToInbound } from '@/lib/whatsapp/providers/waha-inbound';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

/**
 * Inbound reconciliation for WAHA (#1262), mirroring `chatmaid-reconcile.ts` (#511).
 *
 * A message WAHA stored but could not deliver by webhook (Residio down during
 * a deploy, or all retries spent) is read back from
 * `GET /api/{session}/chats/all/messages` and handed to the same handler the
 * webhook uses. The message id there is the webhook's `payload.id`, so the
 * `whatsapp_processed_messages` claim/release dedupe stops a message the
 * webhook handled from being answered again. No cursor is kept: that table is
 * the record of what has been handled.
 *
 * Needs the WAHA session's NOWEB store on (owner decision, #1260): without it
 * the endpoint has nothing to return.
 */

export const WAHA_RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const WAHA_RECONCILE_PAGE_LIMIT = 50;
/** Hard cap on API calls per run: at most MAX_PAGES * PAGE_LIMIT messages are looked at. */
export const WAHA_RECONCILE_MAX_PAGES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export type WahaReconcileResult =
  | { ok: true; summary: ChatmaidReconcileSummary }
  | { ok: false; summary: ChatmaidReconcileSummary; error: string };

export interface WahaReconcileDeps {
  handle?: typeof processChatmaidMessages;
  now?: number;
}

/**
 * One page of inbound messages newer than `sinceSeconds`. Errors name only
 * the HTTP status, never the request headers (the API key). A timeout
 * surfaces as a thrown AbortSignal error, which fails the run.
 */
async function fetchWahaMessagesPage(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'apiKey' | 'session'>,
  sinceSeconds: number,
  offset: number,
  fetchImpl: typeof fetch
): Promise<unknown[]> {
  const params = new URLSearchParams({
    'filter.fromMe': 'false',
    'filter.timestamp.gte': String(sinceSeconds),
    downloadMedia: 'false',
    limit: String(WAHA_RECONCILE_PAGE_LIMIT),
    offset: String(offset),
  });
  const response = await fetchImpl(
    `${config.baseUrl}/api/${encodeURIComponent(config.session)}/chats/all/messages?${params}`,
    {
      headers: { 'X-Api-Key': config.apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`WAHA messages list failed (HTTP ${response.status})`);
  }
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body)) {
    throw new Error('WAHA messages list returned an unexpected shape');
  }
  return body;
}

export async function reconcileWahaInbound(
  config: Pick<WahaWhatsAppConfig, 'baseUrl' | 'apiKey' | 'session'>,
  fetchImpl: typeof fetch = fetch,
  deps: WahaReconcileDeps = {}
): Promise<WahaReconcileResult> {
  const handle = deps.handle ?? processChatmaidMessages;
  const sinceSeconds = Math.floor(((deps.now ?? Date.now()) - WAHA_RECONCILE_WINDOW_MS) / 1000);

  const summary: ChatmaidReconcileSummary = {
    checked: 0,
    alreadyHandled: 0,
    replayed: 0,
    ignored: 0,
    paused: 0,
    pages: 0,
    truncated: false,
  };
  const messages: WhatsAppInboundMessage[] = [];

  for (let page = 0; page < WAHA_RECONCILE_MAX_PAGES; page += 1) {
    const items = await fetchWahaMessagesPage(config, sinceSeconds, page * WAHA_RECONCILE_PAGE_LIMIT, fetchImpl);
    summary.pages = page + 1;

    for (const item of items) {
      // The same extraction as the webhook, so fromMe, groups and @lid are skipped alike.
      const message = wahaMessageToInbound(item);
      // The window is also checked here: a gateway that ignores the filter must not replay old messages.
      if (!message || Number(message.timestamp) < sinceSeconds) {
        summary.ignored += 1;
        continue;
      }
      messages.push(message);
    }

    if (items.length < WAHA_RECONCILE_PAGE_LIMIT) break;
    summary.truncated = page + 1 === WAHA_RECONCILE_MAX_PAGES;
  }

  summary.checked = messages.length;
  if (messages.length === 0) {
    return { ok: true, summary };
  }

  // Oldest first, so replies go out in the order the residents wrote.
  messages.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const { result, pausedCount } = await handle(messages);
  summary.alreadyHandled = result.duplicateCount;
  summary.paused = pausedCount;
  summary.ignored += result.ignoredCount;
  summary.replayed = result.processedCount - result.ignoredCount - pausedCount;

  return result.accepted
    ? { ok: true, summary }
    : { ok: false, summary, error: result.error ?? 'Inbound reconciliation could not be processed' };
}
