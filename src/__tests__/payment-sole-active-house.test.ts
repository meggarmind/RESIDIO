/**
 * #1363: a payment saved without a house (bank-alert and statement imports) takes the
 * resident's only active house. Zero or several active houses leave it null, and an
 * explicit house_id is kept as given.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const RESIDENT = '22222222-2222-4222-8222-222222222222';
const HOUSE_A = '33333333-3333-4333-8333-333333333333';
const HOUSE_B = '44444444-4444-4444-8444-444444444444';
const PAYMENT = '11111111-1111-4111-8111-111111111111';

let residentHouses: Row[] = [];
let residentHousesError: unknown = null;
const inserts: Row[] = [];
const allocate = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ success: true, invoicesPaid: 0, totalAllocated: 0 }));
const audit = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

// resident_houses applies its .eq() filters and .limit() to the fixture, so the query shape is tested too.
function makeBuilder(table: string) {
  const filters: [string, unknown][] = [];
  let limit = Infinity;
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => { filters.push([col, val]); return builder; });
  builder.limit = vi.fn((n: number) => { limit = n; return builder; });
  builder.insert = vi.fn((payload: Row) => { inserts.push(payload); return builder; });
  const result = () => {
    if (table === 'resident_houses') {
      if (residentHousesError) return { data: null, error: residentHousesError };
      const rows = residentHouses.filter((r) => filters.every(([c, v]) => r[c] === v)).slice(0, limit);
      return { data: rows, error: null };
    }
    if (table === 'payment_records') return { data: { id: PAYMENT }, error: null };
    return { data: null, error: null };
  };
  builder.single = vi.fn(async () => result());
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return builder;
}

const supabase = { from: vi.fn((table: string) => makeBuilder(table)) };

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => supabase),
  createAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));
vi.mock('@/actions/billing/wallet', () => ({ allocateWalletToInvoices: (...a: unknown[]) => allocate(...a) }));
vi.mock('@/lib/billing/settle-payment', () => ({
  settlePaymentBatch: (...a: unknown[]) => allocate(...a),
  creditWalletAsService: vi.fn(),
}));
vi.mock('@/lib/matching/duplicate-matcher', () => ({
  checkDuplicateGuardrail: vi.fn(async () => ({ isDuplicate: false })),
}));
vi.mock('@/lib/notifications/event-content', () => ({ isEventChannelEnabled: vi.fn(async () => false) }));
vi.mock('@/lib/notifications/preferences', () => ({ shouldSendToResident: vi.fn() }));
vi.mock('@/lib/whatsapp/outbound', () => ({ buildPaymentReceivedWhatsApp: vi.fn() }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn() }));

const base = { resident_id: RESIDENT, amount: 100, payment_date: new Date('2026-10-30T00:00:00Z'), status: 'paid' as const };
const link = (house_id: string, is_active: boolean) => ({ resident_id: RESIDENT, house_id, is_active });

beforeEach(() => {
  residentHouses = [];
  residentHousesError = null;
  inserts.length = 0;
  allocate.mockClear();
  audit.mockClear();
});

describe('payment house when none is given (#1363)', () => {
  it('uses the only active house for the row, the allocation and the audit', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    residentHouses = [link(HOUSE_A, true), link(HOUSE_B, false)];

    const res = await createPaymentCore(base, { trustedVerification: true });
    expect(res.success).toBe(true);
    expect(inserts[0].house_id).toBe(HOUSE_A);
    expect(allocate.mock.calls[0]).toContain(HOUSE_A);
    expect(audit.mock.calls[0][0]).toMatchObject({ newValues: { house_id: HOUSE_A } });
  });

  it('does the same on the scheduled bank-alert path', async () => {
    const { createPaymentAsSystem } = await import('@/lib/payments/create-payment');
    residentHouses = [link(HOUSE_A, true)];

    const res = await createPaymentAsSystem(base, 'cron:fetch-emails');
    expect(res.success).toBe(true);
    expect(inserts[0].house_id).toBe(HOUSE_A);
    expect(allocate.mock.calls[0][1]).toMatchObject({ houseId: HOUSE_A });
  });

  it('leaves the house null when the resident has no active house', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    residentHouses = [link(HOUSE_A, false)];

    await createPaymentCore(base);
    expect(inserts[0].house_id).toBeNull();
  });

  it('leaves the house null when the resident has several active houses', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    residentHouses = [link(HOUSE_A, true), link(HOUSE_B, true)];

    await createPaymentCore(base);
    expect(inserts[0].house_id).toBeNull();
  });

  it('leaves the house null when the lookup fails, and still records the payment', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    residentHousesError = { message: 'boom' };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await createPaymentCore(base);
    expect(res.success).toBe(true);
    expect(inserts[0].house_id).toBeNull();
  });

  it('keeps an explicit house_id even when another house is the only active one', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    residentHouses = [link(HOUSE_A, true), link(HOUSE_B, false)];

    const res = await createPaymentCore({ ...base, house_id: HOUSE_B });
    expect(res.success).toBe(true);
    expect(inserts[0].house_id).toBe(HOUSE_B);
  });
});
