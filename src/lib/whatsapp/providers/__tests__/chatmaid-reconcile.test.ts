import { describe, expect, it, vi } from 'vitest';
import { createInMemoryProcessedMessageStore, processInboundMessages } from '@/lib/whatsapp/inbound';
import {
  CHATMAID_RECONCILE_MAX_PAGES,
  CHATMAID_RECONCILE_PAGE_LIMIT,
  fetchChatmaidInboundPage,
  reconcileChatmaidInbound,
} from '@/lib/whatsapp/providers/chatmaid-reconcile';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const config = { baseUrl: 'https://chatmaid.test', apiKey: 'sk_live_secret_key' };

const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    from: '+2348000000001',
    to: '+15550001111',
    content: 'balance',
    type: 'text',
    isGroup: false,
    receivedAt: minutesAgo(30),
    ...overrides,
  };
}

/** Serves `items` in pages the way the endpoint does, newest first. */
function pagedSource(items: Record<string, unknown>[], limit = CHATMAID_RECONCILE_PAGE_LIMIT) {
  const totalPages = Math.max(1, Math.ceil(items.length / limit));
  return vi.fn(async (_config: unknown, page: number) => ({
    items: items.slice((page - 1) * limit, page * limit),
    totalPages,
  }));
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

describe('reconcileChatmaidInbound (#511)', () => {
  it('replays a missed message exactly once, even across two runs', async () => {
    const { handle, answered } = harness();
    const fetchPage = pagedSource([item('inmsg_missed')]);

    const first = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });
    const second = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_missed']);
    expect(first).toMatchObject({ ok: true, summary: { checked: 1, replayed: 1, alreadyHandled: 0 } });
    expect(second).toMatchObject({ ok: true, summary: { checked: 1, replayed: 0, alreadyHandled: 1 } });
  });

  it('skips a message the webhook already handled and replays only the missed one', async () => {
    const { handle, answered } = harness(['inmsg_webhook']);
    const fetchPage = pagedSource([item('inmsg_missed'), item('inmsg_webhook')]);

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_missed']);
    expect(result).toMatchObject({ ok: true, summary: { checked: 2, replayed: 1, alreadyHandled: 1 } });
  });

  it('replays oldest first', async () => {
    const { handle, answered } = harness();
    const fetchPage = pagedSource([item('inmsg_new'), item('inmsg_old')]);

    await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_old', 'inmsg_new']);
  });

  it('never answers a group message and ignores chatmaid-event ids', async () => {
    const { handle, answered } = harness();
    const fetchPage = pagedSource([
      item('inmsg_group', { isGroup: true, groupId: '120363@g.us' }),
      item('chatmaid-event-abc123'),
      item('chatmaid-event:message.received:deadbeef'),
      item('inmsg_real'),
    ]);

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_real']);
    expect(handle.mock.calls[0][0].map((m: WhatsAppInboundMessage) => m.id)).toEqual(['inmsg_real', 'inmsg_group']);
    expect(result).toMatchObject({ ok: true, summary: { replayed: 1, ignored: 3 } });
  });

  it('ignores messages older than 24 hours and stops paging at the first one', async () => {
    const { handle, answered } = harness();
    const fetchPage = pagedSource(
      [
        item('inmsg_recent'),
        item('inmsg_stale', { receivedAt: minutesAgo(24 * 60 + 1) }),
        ...Array.from({ length: CHATMAID_RECONCILE_PAGE_LIMIT }, (_, i) => item(`inmsg_older_${i}`, { receivedAt: minutesAgo(30 * 60) })),
      ]
    );

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_recent']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, summary: { checked: 1, pages: 1, truncated: false } });
  });

  it('reads at most the page cap per run and reports truncation', async () => {
    const { handle, answered } = harness();
    const total = CHATMAID_RECONCILE_PAGE_LIMIT * (CHATMAID_RECONCILE_MAX_PAGES + 2);
    const fetchPage = pagedSource(Array.from({ length: total }, (_, i) => item(`inmsg_${i}`)));

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(fetchPage).toHaveBeenCalledTimes(CHATMAID_RECONCILE_MAX_PAGES);
    expect(answered).toHaveLength(CHATMAID_RECONCILE_PAGE_LIMIT * CHATMAID_RECONCILE_MAX_PAGES);
    expect(result).toMatchObject({ ok: true, summary: { pages: CHATMAID_RECONCILE_MAX_PAGES, truncated: true } });
  });

  it('does not report truncation when every page fit', async () => {
    const { handle } = harness();
    const fetchPage = pagedSource(Array.from({ length: CHATMAID_RECONCILE_PAGE_LIMIT * CHATMAID_RECONCILE_MAX_PAGES }, (_, i) => item(`inmsg_${i}`)));

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(result).toMatchObject({ ok: true, summary: { truncated: false } });
  });

  it('ignores entries without a time or a sender instead of answering them', async () => {
    const { handle, answered } = harness();
    const fetchPage = pagedSource([item('inmsg_no_time', { receivedAt: undefined }), item('inmsg_no_from', { from: null }), item('inmsg_ok')]);

    const result = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(answered).toEqual(['inmsg_ok']);
    expect(result).toMatchObject({ ok: true, summary: { replayed: 1, ignored: 2 } });
  });

  it('does not call the handler when there is nothing to reconcile', async () => {
    const { handle } = harness();

    const result = await reconcileChatmaidInbound(config, { fetchPage: pagedSource([]), handle, now: NOW });

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
    const fetchPage = pagedSource([item('inmsg_retry')]);

    const failed = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });
    fail = false;
    const retried = await reconcileChatmaidInbound(config, { fetchPage, handle, now: NOW });

    expect(failed.ok).toBe(false);
    expect(retried).toMatchObject({ ok: true, summary: { replayed: 1 } });
  });
});

describe('fetchChatmaidInboundPage', () => {
  const body = { success: true, data: { data: [item('inmsg_1')], pagination: { page: 2, limit: 50, total: 120, totalPages: 3 } } };

  it('requests the page and limit with the bearer key and parses the nested shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));

    const page = await fetchChatmaidInboundPage(config, 2, 50, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://chatmaid.test/v1/messages/inbound?page=2&limit=50',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk_live_secret_key' } })
    );
    expect(page).toEqual({ items: [expect.objectContaining({ id: 'inmsg_1' })], totalPages: 3 });
  });

  it('throws the HTTP status without echoing the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied sk_live_secret_key', { status: 401 }));

    const error = await fetchChatmaidInboundPage(config, 1, 50, fetchImpl).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Chatmaid inbound list failed (HTTP 401)');
    expect((error as Error).message).not.toContain('sk_live');
  });

  it('throws on an unexpected shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} })));

    await expect(fetchChatmaidInboundPage(config, 1, 50, fetchImpl)).rejects.toThrow('unexpected shape');
  });
});
