import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  notifyAdmins: vi.fn(),
  resolveWhatsAppConfig: vi.fn(),
  sendText: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: mocks.resolveWhatsAppConfig }));
vi.mock('@/lib/whatsapp/providers/chatmaid', () => ({
  createChatmaidWhatsAppProvider: () => ({ sendText: mocks.sendText, sendTemplate: mocks.sendTemplate }),
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: vi.fn().mockResolvedValue({ result: { redirect: false }, envLabel: 'TEST' }),
}));

import { alertStalePendingSends, outboundSendExists, stripPhoneNumbers, updateOutboundSendStatus } from '@/lib/whatsapp/outbound-sends';
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp/provider';

type Result = { data?: unknown; error: unknown };

/** A chainable PostgREST stand-in that records every call and resolves to `result`. */
function query(result: Result) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['insert', 'update', 'select', 'eq', 'in', 'is', 'lt', 'gte', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(resolve(result));
  return { builder, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveWhatsAppConfig.mockResolvedValue({ status: 'ok', config: { provider: 'chatmaid' } });
});

describe('outbound send tracking at the provider seam (#839)', () => {
  it('stores an accepted reply with its resident, phone and the inbound message it answers', async () => {
    const insert = query({ error: null });
    mocks.from.mockReturnValue(insert.builder);
    mocks.sendText.mockResolvedValue({ success: true, messageId: 'outmsg_1' });

    await sendWhatsAppMessage({ to: '+2348000000000', body: 'hi' }, undefined, { purpose: 'inbound_reply' }, {
      residentId: 'resident-1',
      inboundMessageId: 'inmsg_1',
    });

    expect(mocks.from).toHaveBeenCalledWith('whatsapp_outbound_sends');
    expect(insert.calls[0]).toEqual(['insert', [{
      provider: 'chatmaid',
      provider_message_id: 'outmsg_1',
      purpose: 'inbound_reply',
      resident_id: 'resident-1',
      phone_number: '+2348000000000',
      inbound_message_id: 'inmsg_1',
      notification_queue_id: null,
    }]]);
  });

  it('stores a notification template send with its queue id', async () => {
    const insert = query({ error: null });
    mocks.from.mockReturnValue(insert.builder);
    mocks.sendTemplate.mockResolvedValue({ success: true, messageId: 'outmsg_2' });

    await sendWhatsAppTemplate(
      { to: '+2348000000000', templateName: 'announcement', languageCode: 'en', parameters: [] },
      undefined,
      undefined,
      { purpose: 'notification', residentId: 'resident-1', notificationQueueId: 'queue-1' }
    );

    expect(insert.calls[0][1][0]).toMatchObject({ purpose: 'notification', resident_id: 'resident-1', notification_queue_id: 'queue-1' });
  });

  it('stores nothing for a refused send', async () => {
    mocks.sendText.mockResolvedValue({ success: false, error: 'rejected' });
    await sendWhatsAppMessage({ to: '+2348000000000', body: 'hi' }, undefined, { purpose: 'inbound_reply' }, {});
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('still reports the send as accepted when it cannot be stored', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.from.mockReturnValue(query({ error: { message: 'db down' } }).builder);
    mocks.sendText.mockResolvedValue({ success: true, messageId: 'outmsg_3' });

    const result = await sendWhatsAppMessage({ to: '+2348000000000', body: 'hi' }, undefined, { purpose: 'inbound_reply' }, {});

    expect(result).toEqual({ success: true, messageId: 'outmsg_3' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('2348000000000');
    error.mockRestore();
  });
});

describe('updateOutboundSendStatus', () => {
  it('only moves a send forward: delivered never overwrites failed', async () => {
    const update = query({ data: [{ id: 'row-1' }], error: null });
    mocks.from.mockReturnValue(update.builder);

    expect(await updateOutboundSendStatus('chatmaid', 'outmsg_1', 'delivered')).toBe(true);
    expect(update.calls).toContainEqual(['in', ['status', ['pending', 'sent']]]);
    expect(update.calls[0][1][0]).not.toHaveProperty('error_code');
  });

  it('stores the failure reason on failed', async () => {
    const update = query({ data: [], error: null });
    mocks.from.mockReturnValue(update.builder);

    expect(await updateOutboundSendStatus('chatmaid', 'outmsg_1', 'failed', { code: 'E1', message: 'nope' })).toBe(false);
    expect(update.calls[0][1][0]).toMatchObject({ status: 'failed', error_code: 'E1', error_message: 'nope' });
  });

  it('throws on a database error so the webhook asks for a retry', async () => {
    mocks.from.mockReturnValue(query({ error: { message: 'db down' } }).builder);
    await expect(updateOutboundSendStatus('chatmaid', 'outmsg_1', 'sent')).rejects.toEqual({ message: 'db down' });
  });
});

/** A one-row table that honours the `.in('status', ...)` guard, so event order can be replayed. */
function fakeSendRow(initial: string) {
  const row = { status: initial };
  mocks.from.mockImplementation(() => {
    let next: { status: string } | null = null;
    let allowed: string[] = [];
    const builder: Record<string, unknown> = {
      update: (values: { status: string }) => { next = values; return builder; },
      eq: () => builder,
      in: (_column: string, statuses: string[]) => { allowed = statuses; return builder; },
      select: () => builder,
      then: (resolve: (value: Result) => unknown) => {
        const moves = next !== null && allowed.includes(row.status);
        if (moves && next) row.status = next.status;
        return Promise.resolve(resolve({ data: moves ? [{ id: 'row-1' }] : [], error: null }));
      },
    };
    return builder;
  });
  return row;
}

describe('status event order (#941)', () => {
  it.each([
    [['sent', 'delivered']],
    [['delivered', 'sent']],
  ] as const)('ends at delivered when events arrive as %j', async (order) => {
    const row = fakeSendRow('pending');
    for (const status of order) await updateOutboundSendStatus('chatmaid', 'outmsg_1', status);
    expect(row.status).toBe('delivered');
  });

  it.each(['sent', 'delivered'] as const)('never overwrites failed with a late %s', async (status) => {
    const row = fakeSendRow('failed');
    expect(await updateOutboundSendStatus('chatmaid', 'outmsg_1', status)).toBe(false);
    expect(row.status).toBe('failed');
  });

  it('a send settled by a replayed event is no longer pending, so the stale alert skips it', async () => {
    const row = fakeSendRow('pending');
    await updateOutboundSendStatus('chatmaid', 'outmsg_1', 'delivered');
    expect(row.status).not.toBe('pending');
  });
});

describe('outboundSendExists', () => {
  it.each([[[{ id: 'row-1' }], true], [[], false]] as const)('maps %j to %s', async (data, expected) => {
    mocks.from.mockReturnValue(query({ data, error: null }).builder);
    expect(await outboundSendExists('chatmaid', 'outmsg_1')).toBe(expected);
  });

  it('throws on a database error so the webhook asks for a retry', async () => {
    mocks.from.mockReturnValue(query({ error: { message: 'db down' } }).builder);
    await expect(outboundSendExists('chatmaid', 'outmsg_1')).rejects.toEqual({ message: 'db down' });
  });
});

describe('alertStalePendingSends (pending timeout)', () => {
  it('claims Chatmaid sends pending over 15 minutes and alerts admins once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-20T12:00:00.000Z'));
    const claim = query({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    mocks.from.mockReturnValue(claim.builder);
    mocks.notifyAdmins.mockResolvedValue({ success: true, count: 1 });

    expect(await alertStalePendingSends()).toBe(2);
    expect(claim.calls).toEqual(expect.arrayContaining([
      ['eq', ['provider', 'chatmaid']],
      ['eq', ['status', 'pending']],
      ['is', ['pending_alerted_at', null]],
      ['lt', ['created_at', '2026-10-20T11:45:00.000Z']],
    ]));
    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(mocks.notifyAdmins.mock.calls[0][0]).toMatchObject({ category: 'system', actionUrl: '/settings/whatsapp' });
    vi.useRealTimers();
  });

  it('does not alert when nothing is stale', async () => {
    mocks.from.mockReturnValue(query({ data: [], error: null }).builder);
    expect(await alertStalePendingSends()).toBe(0);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });
});

describe('stripPhoneNumbers', () => {
  it.each(['+2348000000000', '+234 800 000 0000', '0800-000-0000'])('strips %s', (phone) => {
    expect(stripPhoneNumbers(`Recipient ${phone} unreachable`)).toBe('Recipient [number] unreachable');
  });

  it('keeps short codes', () => {
    expect(stripPhoneNumbers('error 404 code 1006')).toBe('error 404 code 1006');
  });
});
