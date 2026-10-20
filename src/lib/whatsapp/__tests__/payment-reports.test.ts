import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { createResidentApprovalRequest } from '@/lib/approvals/create-resident-approval-request';
import {
  checkReportDate,
  cleanReference,
  createPaymentReport,
  parseReportAmount,
  parseReportDate,
  reportKey,
} from '@/lib/whatsapp/payment-reports';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn().mockResolvedValue({ recorded: true }) }));
vi.mock('@/lib/approvals/create-resident-approval-request', () => ({ createResidentApprovalRequest: vi.fn() }));

const NOW = new Date('2026-10-20T10:00:00Z');

describe('parseReportAmount', () => {
  it.each([
    ['50000', 50000],
    ['50,000', 50000],
    ['₦50,000.50', 50000.5],
    ['NGN 1,250,000', 1250000],
    ['n75000', 75000],
    ['50000 naira', 50000],
    ['0.00', 0],
  ])('reads %s', (text, expected) => {
    expect(parseReportAmount(text)).toBe(expected);
  });

  it.each(['', 'abc', '5k', '50,00', '1.234', '-500', '50000 dollars', '1e6', 'fifty thousand'])('does not read %j', (text) => {
    expect(parseReportAmount(text)).toBeNull();
  });
});

describe('parseReportDate and checkReportDate', () => {
  it.each([
    ['12 Oct 2026', '2026-10-12'],
    ['12 October 2026', '2026-10-12'],
    ['1st sept 2026', '2026-09-01'],
    ['2026-10-12', '2026-10-12'],
    ['today', '2026-10-20'],
    ['Yesterday', '2026-10-19'],
  ])('reads %s', (text, expected) => {
    expect(parseReportDate(text, NOW)).toBe(expected);
  });

  it.each(['', '12/10/2026', '10/12/2026', '31 Feb 2026', '12 Ox 2026', '12 Oc 2026', '12 Oct', 'next week'])('does not read %j', (text) => {
    expect(parseReportDate(text, NOW)).toBeNull();
  });

  it('follows the Lagos calendar day, not UTC', () => {
    // 23:30 UTC on the 20th is 00:30 on the 21st in Lagos.
    expect(parseReportDate('today', new Date('2026-10-20T23:30:00Z'))).toBe('2026-10-21');
  });

  it('allows today and 90 days back, and refuses the future and 91 days back', () => {
    expect(checkReportDate('2026-10-20', NOW)).toBe('ok');
    expect(checkReportDate('2026-07-22', NOW)).toBe('ok');
    expect(checkReportDate('2026-07-21', NOW)).toBe('too_old');
    expect(checkReportDate('2026-10-21', NOW)).toBe('future');
  });

  it('keeps a reference of up to 100 characters and trims it', () => {
    expect(cleanReference('  GTB   TRF FROM ADA ')).toBe('GTB TRF FROM ADA');
    expect(cleanReference('x'.repeat(100))).toHaveLength(100);
    expect(cleanReference('x'.repeat(101))).toBeNull();
    expect(cleanReference('   ')).toBeNull();
  });
});

type Call = { table: string; op: string; args: unknown[] };

function mockDb(results: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'limit', 'gte']) {
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
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { calls };
}

const input = {
  residentId: 'resident-1',
  houseId: 'house-1',
  houseLabel: '12 Palm Close',
  amount: 50000,
  paymentDate: '2026-10-12',
  reference: 'GTB TRF FROM ADA',
  now: NOW,
};

/** A resident billed for the house, `count` reports already today, then the payment insert result. */
function happyDb(over: { count?: number; payment?: unknown } = {}) {
  return mockDb({
    resident_houses: [{ data: [{ house_id: 'house-1' }], error: null }],
    approval_requests: [{ count: over.count ?? 0, error: null }],
    payment_records: [over.payment ?? { data: { id: 'payment-1' }, error: null }, { error: null }, { error: null }],
  });
}

beforeEach(() => {
  vi.mocked(recordAudit).mockClear();
  vi.mocked(createResidentApprovalRequest).mockReset().mockResolvedValue({ success: true, request_id: 'request-1' });
});

describe('createPaymentReport (#816 decisions 11-12)', () => {
  it('files a pending, unverified payment with no proof, then its approval request, and audits the resident', async () => {
    const { calls } = happyDb();

    const result = await createPaymentReport({ ...input, screenshotAt: '09:53 on 9 Oct 2025' });

    expect(result).toEqual({ status: 'created', paymentId: 'payment-1', requestId: 'request-1' });
    const insert = calls.find((call) => call.table === 'payment_records' && call.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      resident_id: 'resident-1',
      house_id: 'house-1',
      amount: 50000,
      status: 'pending',
      is_verified: false,
      method: 'bank_transfer',
      reference_number: 'GTB TRF FROM ADA',
      whatsapp_report_key: 'house-1|5000000|2026-10-12',
    });
    expect(insert.notes).toBe('Reported via WhatsApp. Screenshot sent to the estate phone at 09:53 on 9 Oct 2025.');
    expect(insert).not.toHaveProperty('proof_url');
    // Noon in Lagos, so it lands on the reported day everywhere.
    expect(insert.payment_date).toBe('2026-10-12T11:00:00.000Z');
    expect(createResidentApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'resident-1', request_type: 'whatsapp_payment_report', entity_type: 'payment_record', entity_id: 'payment-1' })
    );
    expect(calls).toContainEqual({ table: 'payment_records', op: 'update', args: [{ approval_request_id: 'request-1' }] });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'payment_records', entityId: 'payment-1' }),
      { userId: null, residentId: 'resident-1' }
    );
  });

  it('notes only "Reported via WhatsApp" when there was no screenshot', async () => {
    const { calls } = happyDb();
    await createPaymentReport(input);
    const insert = calls.find((call) => call.table === 'payment_records' && call.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert.notes).toBe('Reported via WhatsApp');
  });

  it('refuses the same amount, date and property a second time, through the unique key', async () => {
    happyDb({ payment: { data: null, error: { code: '23505', message: 'duplicate key' } } });
    expect(await createPaymentReport(input)).toEqual({ status: 'duplicate' });
    expect(createResidentApprovalRequest).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('refuses a fourth report in a day without writing anything', async () => {
    const { calls } = happyDb({ count: 3 });
    expect(await createPaymentReport(input)).toEqual({ status: 'limit' });
    expect(calls.some((call) => call.table === 'payment_records')).toBe(false);
  });

  it('counts the day from midnight in Lagos', async () => {
    const { calls } = happyDb();
    await createPaymentReport({ ...input, now: new Date('2026-10-20T23:30:00Z') });
    expect(calls).toContainEqual({ table: 'approval_requests', op: 'gte', args: ['created_at', '2026-10-20T23:00:00.000Z'] });
  });

  it('refuses a property the resident is not billed for', async () => {
    const { calls } = mockDb({ resident_houses: [{ data: [], error: null }] });
    expect(await createPaymentReport(input)).toEqual({ status: 'not_your_property' });
    expect(calls.some((call) => call.table === 'payment_records')).toBe(false);
  });

  it.each([
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['an amount over the cap', { amount: 2_000_000_000 }],
    ['a future date', { paymentDate: '2026-10-21' }],
    ['a date over 90 days ago', { paymentDate: '2026-07-01' }],
    ['a blank reference', { reference: '  ' }],
  ])('refuses %s before touching the database', async (_label, override) => {
    const { calls } = mockDb({});
    expect(await createPaymentReport({ ...input, ...override })).toEqual({ status: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('removes the pending payment again when its approval request cannot be filed', async () => {
    vi.mocked(createResidentApprovalRequest).mockResolvedValue({ success: false, duplicate: false, error: 'enum value missing' });
    const { calls } = happyDb();

    await expect(createPaymentReport(input)).rejects.toThrow('Payment report approval not filed: enum value missing');
    expect(calls).toContainEqual({ table: 'payment_records', op: 'delete', args: [] });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('keys by property, amount in kobo and day', () => {
    expect(reportKey('house-1', 50000.5, '2026-10-12')).toBe('house-1|5000050|2026-10-12');
  });
});
