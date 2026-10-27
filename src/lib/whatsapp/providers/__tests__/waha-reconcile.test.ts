import { describe, expect, it, vi } from 'vitest';
import { createInMemoryProcessedMessageStore, processInboundMessages } from '@/lib/whatsapp/inbound';
import {
  WAHA_RECONCILE_MAX_PAGES,
  WAHA_RECONCILE_PAGE_LIMIT,
  reconcileWahaInbound,
} from '@/lib/whatsapp/providers/waha-reconcile';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const config = { baseUrl: 'https://waha.test', apiKey: 'waha-secret-key', session: 'default' };
const secondsAgo = (minutes: number) => Math.floor((NOW - minutes * 60_000) / 1000);

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    timestamp: secondsAgo(30),
    from: '2348000000001@c.us',
    fromMe: false,
    body: 'balance',
    hasMedia: false,
    ...overrides,
  };
}

/** Serves `items` by offset, as the WAHA messages endpoint does. */
function pagedFetch(items: unknown[]) {
  return vi.fn(async (url: string | URL | Request) => {
    const offset = Number(new URL(String(url)).searchParams.get('offset'));
    return new Response(JSON.stringify(items.slice(offset, offset + WAHA_RECONCILE_PAGE_LIMIT)));
  });
}

/** The real claim/release dedupe over an in-memory store; `handled` ids are pre-claimed as the webhook would leave them. */
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

describe('reconcileWahaInbound', () => {
  it('asks WAHA for inbound messages inside the 24 h window with the API key header', async () => {
    const fetchImpl = pagedFetch([]);
    await reconcileWahaInbound(config, fetchImpl, { handle: harness().handle, now: NOW });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/default/chats/all/messages');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      'filter.fromMe': 'false',
      'filter.timestamp.gte': String(Math.floor((NOW - 24 * 60 * 60 * 1000) / 1000)),
      downloadMedia: 'false',
      limit: String(WAHA_RECONCILE_PAGE_LIMIT),
      offset: '0',
    });
    expect(init.headers).toEqual({ 'X-Api-Key': 'waha-secret-key' });
  });

  it('replays a missed message once and skips one the webhook handled', async () => {
    const { handle, answered } = harness(['handled']);
    const fetchImpl = pagedFetch([item('missed'), item('handled')]);

    const first = await reconcileWahaInbound(config, fetchImpl, { handle, now: NOW });
    const second = await reconcileWahaInbound(config, fetchImpl, { handle, now: NOW });

    expect(answered).toEqual(['missed']);
    expect(first).toMatchObject({ ok: true, summary: { checked: 2, replayed: 1, alreadyHandled: 1 } });
    expect(second).toMatchObject({ ok: true, summary: { checked: 2, replayed: 0, alreadyHandled: 2 } });
  });

  it('ignores a message older than the window even if WAHA returns it', async () => {
    const { handle, answered } = harness();
    const result = await reconcileWahaInbound(config, pagedFetch([item('old', { timestamp: secondsAgo(25 * 60) })]), {
      handle,
      now: NOW,
    });
    expect(answered).toEqual([]);
    expect(result.summary).toMatchObject({ checked: 0, ignored: 1 });
  });

  it('skips fromMe and group messages without answering them', async () => {
    const { handle, answered } = harness();
    const fetchImpl = pagedFetch([
      item('mine', { fromMe: true }),
      item('group', { from: '120363000000000000@g.us' }),
      item('real'),
    ]);

    const result = await reconcileWahaInbound(config, fetchImpl, { handle, now: NOW });

    expect(answered).toEqual(['real']);
    expect(result.summary).toMatchObject({ replayed: 1, ignored: 2 });
  });

  it('stops at the page cap and reports truncation', async () => {
    const many = Array.from({ length: WAHA_RECONCILE_PAGE_LIMIT * (WAHA_RECONCILE_MAX_PAGES + 1) }, (_, i) => item(`m${i}`));
    const fetchImpl = pagedFetch(many);

    const result = await reconcileWahaInbound(config, fetchImpl, { handle: harness().handle, now: NOW });

    expect(fetchImpl).toHaveBeenCalledTimes(WAHA_RECONCILE_MAX_PAGES);
    expect(result.summary).toMatchObject({ pages: WAHA_RECONCILE_MAX_PAGES, truncated: true, checked: WAHA_RECONCILE_PAGE_LIMIT * WAHA_RECONCILE_MAX_PAGES });
  });

  it('answers the oldest message first', async () => {
    const { handle, answered } = harness();
    await reconcileWahaInbound(config, pagedFetch([item('newer', { timestamp: secondsAgo(5) }), item('older', { timestamp: secondsAgo(50) })]), {
      handle,
      now: NOW,
    });
    expect(answered).toEqual(['older', 'newer']);
  });

  it('surfaces a timeout or HTTP error as a failure, without the API key', async () => {
    const timeout = vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    await expect(reconcileWahaInbound(config, timeout, { handle: harness().handle, now: NOW })).rejects.toThrow(/timeout/);

    const failing = vi.fn().mockResolvedValue(new Response('{}', { status: 502 }));
    const error = await reconcileWahaInbound(config, failing, { handle: harness().handle, now: NOW }).catch((e: Error) => e);
    expect(String(error)).toContain('HTTP 502');
    expect(String(error)).not.toContain('waha-secret-key');
  });

  it('passes each call a 15 s timeout signal', async () => {
    const fetchImpl = pagedFetch([]);
    await reconcileWahaInbound(config, fetchImpl, { handle: harness().handle, now: NOW });
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });
});
