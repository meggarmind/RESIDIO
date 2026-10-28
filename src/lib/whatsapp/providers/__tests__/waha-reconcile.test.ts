import { describe, expect, it, vi } from 'vitest';
import { createInMemoryProcessedMessageStore, processInboundMessages } from '@/lib/whatsapp/inbound';
import {
  WAHA_RECONCILE_MAX_PAGES,
  WAHA_RECONCILE_PAGE_LIMIT,
  reconcileWahaInbound,
} from '@/lib/whatsapp/providers/waha-reconcile';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW / 1000);
const WINDOW_START = NOW_SECONDS - 24 * 60 * 60;
const config = { baseUrl: 'https://waha.test', session: 'default', apiKey: 'waha_secret_key' };

const minutesAgo = (minutes: number) => NOW_SECONDS - minutes * 60;

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: minutesAgo(30),
    from: '2348000000001@c.us',
    fromMe: false,
    source: 'app',
    to: '15550001111@c.us',
    body: 'balance',
    hasMedia: false,
    ack: 1,
    ...overrides,
  };
}

/**
 * A fetch that serves `items` as the store does: honours `limit` and `offset`.
 * The `filter.*` parameters are NOT applied, so a test can prove the code also
 * drops what the server should already have filtered.
 */
function storeFetch(items: Record<string, unknown>[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const params = new URL(String(input)).searchParams;
    const offset = Number(params.get('offset'));
    const limit = Number(params.get('limit'));
    return new Response(JSON.stringify(items.slice(offset, offset + limit)));
  });
}

/**
 * The real claim/release dedupe over an in-memory store, with the Assistant
 * reply replaced by a spy. `handled` ids are pre-claimed, as the webhook
 * would have left them.
 */
function harness(handled: string[] = []) {
  const store = createInMemoryProcessedMessageStore();
  const answered: string[] = [];
  const ready = Promise.all(handled.map((id) => store.claim(id, new Date(NOW).toISOString())));
  const handle = vi.fn(async (messages: WhatsAppInboundMessage[]) => {
    await ready;
    const result = await processInboundMessages(messages, {
      store,
      onMessage: async (message) => {
        answered.push(message.id);
      },
    });
    return { result, pausedCount: 0 };
  });
  return { handle, answered };
}

describe('reconcileWahaInbound (#1262)', () => {
  it('requests the store with the API key, the 24 hour window and the media and fromMe filters', async () => {
    const { handle } = harness();
    const fetchImpl = storeFetch([]);

    await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(requestUrl);
    expect(parsed.origin + parsed.pathname).toBe('https://waha.test/api/default/chats/all/messages');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      limit: '50',
      offset: '0',
      downloadMedia: 'false',
      'filter.fromMe': 'false',
      'filter.timestamp.gte': String(WINDOW_START),
    });
    expect(init.headers).toEqual({ 'X-Api-Key': 'waha_secret_key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('replays a missed message exactly once, even across two runs', async () => {
    const { handle, answered } = harness();
    const fetchImpl = storeFetch([item('true_2348000000001@c.us_MISSED')]);

    const first = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });
    const second = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toEqual(['true_2348000000001@c.us_MISSED']);
    expect(first).toMatchObject({ ok: true, summary: { checked: 1, replayed: 1, alreadyHandled: 0 } });
    expect(second).toMatchObject({ ok: true, summary: { checked: 1, replayed: 0, alreadyHandled: 1 } });
  });

  it('skips a message the webhook already handled and replays only the missed one', async () => {
    const { handle, answered } = harness(['webhook-id']);
    const fetchImpl = storeFetch([item('missed-id'), item('webhook-id')]);

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toEqual(['missed-id']);
    expect(result).toMatchObject({ ok: true, summary: { checked: 2, replayed: 1, alreadyHandled: 1 } });
  });

  it('replays oldest first', async () => {
    const { handle, answered } = harness();
    const fetchImpl = storeFetch([item('newest', { timestamp: minutesAgo(5) }), item('oldest', { timestamp: minutesAgo(50) })]);

    await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toEqual(['oldest', 'newest']);
  });

  it('never answers a group, a handset send or a hidden-id sender, and counts them skipped', async () => {
    const { handle, answered } = harness();
    const fetchImpl = storeFetch([
      item('group', { from: '120363000000000000@g.us' }),
      item('mine', { fromMe: true }),
      item('lid', { from: '98765432109876@lid' }),
      item('real'),
    ]);

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toEqual(['real']);
    expect(result).toMatchObject({ ok: true, summary: { checked: 4, replayed: 1, skipped: 3 } });
  });

  it('drops a message older than the window even when the server returns it', async () => {
    const { handle, answered } = harness();
    const fetchImpl = storeFetch([item('recent'), item('stale', { timestamp: WINDOW_START - 60 }), item('boundary', { timestamp: WINDOW_START })]);

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered.sort()).toEqual(['boundary', 'recent']);
    expect(result).toMatchObject({ ok: true, summary: { checked: 2, skipped: 1 } });
  });

  it('skips entries without an id or a usable time instead of answering them', async () => {
    const { handle, answered } = harness();
    const fetchImpl = storeFetch([item('no-time', { timestamp: undefined }), { from: '2348000000001@c.us', timestamp: minutesAgo(1), body: 'x' }, item('ok')]);

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toEqual(['ok']);
    expect(result).toMatchObject({ ok: true, summary: { replayed: 1, skipped: 2 } });
  });

  it('reads at most the page cap per run, pages by offset, and reports truncation', async () => {
    const { handle, answered } = harness();
    const total = WAHA_RECONCILE_PAGE_LIMIT * (WAHA_RECONCILE_MAX_PAGES + 2);
    const fetchImpl = storeFetch(Array.from({ length: total }, (_, i) => item(`m${i}`)));

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(fetchImpl).toHaveBeenCalledTimes(WAHA_RECONCILE_MAX_PAGES);
    expect(fetchImpl.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('offset'))).toEqual(['0', '50', '100']);
    expect(answered).toHaveLength(WAHA_RECONCILE_PAGE_LIMIT * WAHA_RECONCILE_MAX_PAGES);
    expect(result).toMatchObject({ ok: true, summary: { pages: WAHA_RECONCILE_MAX_PAGES, truncated: true } });
  });

  it('stops at a short page and does not report truncation', async () => {
    const { handle } = harness();
    const fetchImpl = storeFetch(Array.from({ length: WAHA_RECONCILE_PAGE_LIMIT + 5 }, (_, i) => item(`m${i}`)));

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, summary: { checked: WAHA_RECONCILE_PAGE_LIMIT + 5, pages: 2, truncated: false } });
  });

  it('does not report truncation when the cap lands exactly on the last page', async () => {
    const { handle } = harness();
    const fetchImpl = storeFetch(Array.from({ length: WAHA_RECONCILE_PAGE_LIMIT * WAHA_RECONCILE_MAX_PAGES - 1 }, (_, i) => item(`m${i}`)));

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(result).toMatchObject({ ok: true, summary: { pages: WAHA_RECONCILE_MAX_PAGES, truncated: false } });
  });

  it('counts a message repeated across two pages once', async () => {
    const { handle, answered } = harness();
    const page = Array.from({ length: WAHA_RECONCILE_PAGE_LIMIT }, (_, i) => item(`m${i}`));
    // The second page repeats the last message of the first, as when a new message shifts the offsets.
    const fetchImpl = storeFetch([...page, page[WAHA_RECONCILE_PAGE_LIMIT - 1]]);

    const result = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(answered).toHaveLength(WAHA_RECONCILE_PAGE_LIMIT);
    expect(result).toMatchObject({ ok: true, summary: { checked: WAHA_RECONCILE_PAGE_LIMIT } });
  });

  it('does not call the handler when there is nothing to reconcile', async () => {
    const { handle } = harness();

    const result = await reconcileWahaInbound(config, storeFetch([]) as unknown as typeof fetch, { handle, now: NOW });

    expect(handle).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, summary: { checked: 0, replayed: 0 } });
  });

  it('reports a failed batch and lets the next run retry it', async () => {
    const store = createInMemoryProcessedMessageStore();
    let fail = true;
    const handle = vi.fn(async (messages: WhatsAppInboundMessage[]) => ({
      result: await processInboundMessages(messages, {
        store,
        onMessage: async () => {
          if (fail) throw new Error('boom');
        },
      }),
      pausedCount: 0,
    }));
    const fetchImpl = storeFetch([item('retry-id')]);

    const failed = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });
    fail = false;
    const retried = await reconcileWahaInbound(config, fetchImpl as unknown as typeof fetch, { handle, now: NOW });

    expect(failed.ok).toBe(false);
    expect(retried).toMatchObject({ ok: true, summary: { replayed: 1 } });
  });

  it('throws the HTTP status without echoing the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied waha_secret_key', { status: 401 }));

    const error = await reconcileWahaInbound(config, fetchImpl, { now: NOW }).catch((e: Error) => e);

    expect((error as Error).message).toBe('WAHA message list failed (HTTP 401)');
    expect((error as Error).message).not.toContain('waha_secret_key');
  });

  it('throws on an unexpected shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] })));

    await expect(reconcileWahaInbound(config, fetchImpl, { now: NOW })).rejects.toThrow('unexpected shape');
  });

  it('surfaces a timeout as a failure, with no key in the message', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const fetchImpl = vi.fn().mockRejectedValue(timeout);

    const error = await reconcileWahaInbound(config, fetchImpl, { now: NOW }).catch((e: Error) => e);

    expect((error as Error).name).toBe('TimeoutError');
    expect((error as Error).message).not.toContain('waha_secret_key');
  });

  it('gives each call a 15 second timeout signal', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      await reconcileWahaInbound(config, storeFetch([]) as unknown as typeof fetch, { now: NOW });
      expect(spy).toHaveBeenCalledWith(15_000);
    } finally {
      spy.mockRestore();
    }
  });
});
