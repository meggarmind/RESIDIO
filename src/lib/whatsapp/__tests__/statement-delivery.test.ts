import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { addToQueue } from '@/lib/notifications/queue';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { loadAccountStatement } from '@/lib/billing/account-statement-data';
import {
  buildStatementEmail,
  loadWhatsAppStatementForPeriod,
  markStatementEmailSent,
  purgeExpiredStatementFiles,
  queueStatementEmail,
  releaseStatementsAwaitingEmail,
  retryFailedStatementSend,
  storeStatementPdf,
} from '@/lib/whatsapp/statement-delivery';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF')) }));
vi.mock('@/lib/pdf/account-statement', () => ({ AccountStatementPDF: vi.fn(() => null) }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn(), PRIORITY: { NORMAL: 5 } }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/billing/account-statement-data', () => ({ loadAccountStatement: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn().mockResolvedValue({ ok: true, residentOverride: true }) }));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: vi.fn().mockResolvedValue({ status: 'ok', values: new Map([['estate_name', 'Palm Estate']]) }),
}));

const statement = {
  resident: { id: 'resident-1', name: 'Ada Example', resident_code: 'RES001', email: null, phone: null, entity_type: 'individual', company_name: null },
  house: { id: 'house-1', address: '12, Palm Close', short_name: 'Block 18A' },
  period: { from: '2026-01-01', to: '2026-10-20' },
  openingBalance: 45000,
  closingBalance: -2000,
  summary: { totalInvoiced: 0, totalPaid: 0, totalCredits: 0, totalDebits: 0, netChange: 0 },
  transactions: [],
  generatedAt: '2026-10-20T10:00:00Z',
  generatedBy: null,
} as AccountStatementData;

type Call = { table: string; op: string; args: unknown[] };

/** A recording PostgREST stand-in: every chain resolves to the next queued result for its table. */
function mockDb(results: Record<string, unknown[]>, storage: Record<string, ReturnType<typeof vi.fn>> = {}) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'eq', 'is', 'not', 'lt', 'in', 'limit', 'order']) {
      chain[op] = vi.fn((...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      });
    }
    const next = () => (results[table] || []).shift() ?? { data: null, error: null };
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (value: unknown) => unknown) => resolve(next());
    return chain;
  });
  const bucket = {
    upload: storage.upload ?? vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: storage.createSignedUrl ?? vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null }),
    remove: storage.remove ?? vi.fn().mockResolvedValue({ error: null }),
  };
  const storageFrom = vi.fn().mockReturnValue(bucket);
  vi.mocked(createAdminClient).mockReturnValue({ from, storage: { from: storageFrom } } as unknown as ReturnType<typeof createAdminClient>);
  return { calls, bucket, storageFrom };
}

const input = {
  residentId: 'resident-1',
  phoneNumber: '+2348000000000',
  houseId: 'house-1',
  period: 'this_month' as const,
  fromDate: '2026-10-01',
  toDate: '2026-10-20',
  rowCount: 12,
  inboundMessageId: 'wamid-9',
};

beforeEach(() => {
  vi.mocked(addToQueue).mockReset();
  vi.mocked(sendWhatsAppMessage).mockReset();
});

describe('WhatsApp statement PDF in chat (#804 decision 24)', () => {
  it('records the request before uploading to private storage, and returns a 1-hour signed URL', async () => {
    const { calls, bucket, storageFrom } = mockDb({ whatsapp_statement_requests: [{ error: null }] });

    const url = await storeStatementPdf({ ...input, replyText: 'Your PDF is attached.' }, statement);

    expect(url).toBe('https://storage.test/signed');
    const insert = calls.find((call) => call.op === 'insert')!;
    const row = insert.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ resident_id: 'resident-1', delivery: 'chat', status: 'sent', row_count: 12, inbound_message_id: 'wamid-9', reply_text: 'Your PDF is attached.' });
    expect(row.storage_path).toMatch(/^statements\/[0-9a-f-]{36}\.pdf$/);
    expect(storageFrom).toHaveBeenCalledWith('whatsapp-media');
    expect(bucket.upload).toHaveBeenCalledWith(row.storage_path, expect.any(Uint8Array), { contentType: 'application/pdf', upsert: true });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(row.storage_path, 3600);
    expect(vi.mocked(bucket.upload).mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(createAdminClient).mock.invocationCallOrder[0]);
  });

  it('uploads nothing when the request row cannot be written', async () => {
    const { bucket } = mockDb({ whatsapp_statement_requests: [{ error: { message: 'denied' } }] });
    await expect(storeStatementPdf({ ...input, replyText: 'x' }, statement)).rejects.toMatchObject({ message: 'denied' });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('resends a failed statement once with a fresh signed URL, under the resident\'s override flag', async () => {
    mockDb({
      whatsapp_outbound_sends: [{ data: { inbound_message_id: 'wamid-9' }, error: null }],
      whatsapp_statement_requests: [{ data: [{ resident_id: 'resident-1', phone_number: '+2348000000000', reply_text: 'Your PDF is attached.', storage_path: 'statements/a.pdf' }], error: null }],
    });
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ success: true });

    await expect(retryFailedStatementSend('chatmaid', 'chatmaid-msg-1')).resolves.toBe(true);

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      { to: '+2348000000000', body: 'Your PDF is attached.', idempotencySeed: 'wamid-9:statement-retry', mediaUrls: ['https://storage.test/signed'] },
      undefined,
      { residentOverride: true },
      { residentId: 'resident-1', inboundMessageId: 'wamid-9' }
    );
  });

  it('does not resend when the retry was already claimed or the send was not a statement', async () => {
    const { calls } = mockDb({
      whatsapp_outbound_sends: [{ data: { inbound_message_id: 'wamid-9' }, error: null }],
      whatsapp_statement_requests: [{ data: [], error: null }],
    });
    await expect(retryFailedStatementSend('chatmaid', 'm')).resolves.toBe(false);
    expect(calls).toEqual(expect.arrayContaining([
      { table: 'whatsapp_statement_requests', op: 'is', args: ['retried_at', null] },
      { table: 'whatsapp_statement_requests', op: 'is', args: ['file_deleted_at', null] },
    ]));

    mockDb({ whatsapp_outbound_sends: [{ data: null, error: null }] });
    await expect(retryFailedStatementSend('chatmaid', 'other')).resolves.toBe(false);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('deletes statement files older than 12 hours and stamps them', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const { calls } = mockDb({
      whatsapp_statement_requests: [{ data: [{ id: 'r1', storage_path: 'statements/r1.pdf' }, { id: 'r2', storage_path: 'statements/r2.pdf' }], error: null }, { error: null }],
    }, { remove });
    const now = new Date('2026-10-20T12:00:00Z');

    await expect(purgeExpiredStatementFiles(now)).resolves.toBe(2);

    expect(calls).toContainEqual({ table: 'whatsapp_statement_requests', op: 'lt', args: ['created_at', '2026-10-20T00:00:00.000Z'] });
    expect(remove).toHaveBeenCalledWith(['statements/r1.pdf', 'statements/r2.pdf']);
    expect(calls).toContainEqual({ table: 'whatsapp_statement_requests', op: 'update', args: [{ file_deleted_at: now.toISOString(), updated_at: now.toISOString() }] });
  });

  it('keeps the rows unstamped when storage refuses the delete, so the next run tries again', async () => {
    const remove = vi.fn().mockResolvedValue({ error: { message: 'storage down' } });
    const { calls } = mockDb({ whatsapp_statement_requests: [{ data: [{ id: 'r1', storage_path: 'statements/r1.pdf' }], error: null }] }, { remove });
    await expect(purgeExpiredStatementFiles()).rejects.toThrow('storage down');
    expect(calls.some((call) => call.op === 'update')).toBe(false);
  });
});

describe('WhatsApp statement by email (#804 decision 24)', () => {
  it('queues the email with the request id for the notification cron', async () => {
    const { calls } = mockDb({ whatsapp_statement_requests: [{ error: null }] });
    vi.mocked(addToQueue).mockResolvedValue({ success: true, queueId: 'queue-1' });

    await queueStatementEmail('request-1', 'resident-1', 'ada@gmail.com');

    expect(addToQueue).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: 'resident-1',
      recipient_email: 'ada@gmail.com',
      channel: 'email',
      metadata: { whatsapp_statement_request_id: 'request-1' },
    }));
    expect(calls).toContainEqual({ table: 'whatsapp_statement_requests', op: 'update', args: [expect.objectContaining({ status: 'queued', notification_queue_id: 'queue-1' })] });
  });

  it('throws when the queue refuses it', async () => {
    mockDb({});
    vi.mocked(addToQueue).mockResolvedValue({ success: false, error: 'queue full' });
    await expect(queueStatementEmail('request-1', 'resident-1', 'ada@gmail.com')).rejects.toThrow('queue full');
  });

  it('moves a queued request to sent once its email has left, and never revives a cancelled one (#917)', async () => {
    const { calls } = mockDb({ whatsapp_statement_requests: [{ error: null }] });

    await markStatementEmailSent('request-1');

    expect(calls.find((call) => call.op === 'update')!.args[0]).toMatchObject({ status: 'sent' });
    expect(calls.filter((call) => call.op === 'eq').map((call) => call.args)).toEqual([['id', 'request-1'], ['status', 'queued']]);
  });

  it('throws when the status update fails', async () => {
    mockDb({ whatsapp_statement_requests: [{ error: { message: 'denied' } }] });
    await expect(markStatementEmailSent('request-1')).rejects.toMatchObject({ message: 'denied' });
  });

  it('queues every statement waiting for an email once the address exists', async () => {
    mockDb({ whatsapp_statement_requests: [{ data: [{ id: 'a' }, { id: 'b' }], error: null }, { error: null }, { error: null }] });
    vi.mocked(addToQueue).mockResolvedValue({ success: true, queueId: 'q' });

    await expect(releaseStatementsAwaitingEmail('resident-1', 'ada@gmail.com')).resolves.toBe(2);
    expect(vi.mocked(addToQueue).mock.calls.map((call) => call[0].metadata)).toEqual([
      { whatsapp_statement_request_id: 'a' },
      { whatsapp_statement_request_id: 'b' },
    ]);
  });

  it('builds the email with the statement PDF attached, from the stored dates', async () => {
    mockDb({ whatsapp_statement_requests: [{ data: { resident_id: 'resident-1', house_id: 'house-1', period: 'this_year', from_date: '2026-01-01', to_date: '2026-10-20' }, error: null }] });
    vi.mocked(loadAccountStatement).mockResolvedValue({ data: statement, error: null });

    const email = await buildStatementEmail('request-1');

    expect(loadAccountStatement).toHaveBeenCalledWith(expect.anything(), { residentId: 'resident-1', houseId: 'house-1', fromDate: '2026-01-01', toDate: '2026-10-20' });
    expect(email.attachments).toEqual([{ filename: 'statement-2026-01-01-to-2026-10-20.pdf', content: Buffer.from('%PDF') }]);
    expect(email.react.props).toMatchObject({
      estateName: 'Palm Estate',
      residentName: 'Ada Example',
      propertyLabel: 'Block 18A',
      periodLabel: 'this year, 1 Jan 2026 to 20 Oct 2026',
      openingBalance: '₦45,000.00',
      closingBalance: '−₦2,000.00',
    });
  });
});

describe('Since move-in start date (#864)', () => {
  const now = new Date('2026-10-20T10:00:00Z');

  it('reads only active links with a billable role and starts on the earliest of them', async () => {
    const { calls } = mockDb({ resident_houses: [{ data: [{ move_in_date: '2025-06-01' }, { move_in_date: '2025-02-03' }], error: null }] });
    vi.mocked(loadAccountStatement).mockResolvedValue({ data: statement, error: null } as never);

    const loaded = await loadWhatsAppStatementForPeriod('resident-1', 'house-1', 'since_move_in', now);

    expect(loaded?.fromDate).toBe('2025-02-03');
    expect(calls).toContainEqual({ table: 'resident_houses', op: 'eq', args: ['is_active', true] });
    expect(calls).toContainEqual({ table: 'resident_houses', op: 'in', args: ['resident_role', ['resident_landlord', 'non_resident_landlord', 'developer', 'tenant']] });
  });

  it('returns null, building nothing, when no active billable link exists', async () => {
    mockDb({ resident_houses: [{ data: [], error: null }] });
    vi.mocked(loadAccountStatement).mockClear();

    expect(await loadWhatsAppStatementForPeriod('resident-1', 'house-1', 'since_move_in', now)).toBeNull();
    expect(loadAccountStatement).not.toHaveBeenCalled();
  });
});
