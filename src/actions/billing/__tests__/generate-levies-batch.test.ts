/**
 * #778: retroactive levy generation reads auth, the user and the two levy settings once
 * per batch, not once per house, and keeps each house's outcome separate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getSystemSetting: vi.fn(),
  getUser: vi.fn(),
  logAudit: vi.fn(),
  debit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: mocks.getSystemSetting }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/billing/wallet-invoice-debit', () => ({ debitWalletForInvoiceAtomic: mocks.debit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { generateLeviesForHouse, generateRetroactiveLevies } from '@/actions/billing/generate-levies';

const houseId = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const residentOf = (id: string) => `res-${id}`;
const HOUSES = Array.from({ length: 12 }, (_, i) => ({ id: houseId(i + 1), house_number: `H${i + 1}` }));
// House n: n % 3 === 0 already has the levy (skipped), n % 3 === 1 fails the invoice insert (error), else generated.
const outcomeOf = (id: string) => (Number(id.slice(0, 8)) % 3 === 0 ? 'skipped' : Number(id.slice(0, 8)) % 3 === 1 ? 'error' : 'generated');
const PROFILE = { id: 'profile-1', name: 'Gate levy', target_type: 'house', applicable_roles: null, is_one_time: true, is_development_levy: false, billing_items: [{ id: 'item-1', name: 'Fee', amount: 100, frequency: 'one_time', is_mandatory: true }] };

let invoiceInserts: Array<Record<string, unknown>>;
let houseSingleReads: number;
let sameDayLevyCount: number;

function fakeSupabase() {
  return {
    auth: { getUser: mocks.getUser },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = 'select';
      let payload: Record<string, unknown> | null = null;
      const chain: Record<string, unknown> = {};
      const settle = () => {
        const hid = filters.house_id as string | undefined;
        if (table === 'houses') return op === 'single' ? { data: HOUSES.find((h) => h.id === filters.id) ?? null, error: null } : { data: HOUSES, error: null };
        if (table === 'resident_houses') return { data: { resident_id: residentOf(hid!), resident_role: 'resident_landlord' }, error: null };
        if (table === 'billing_profiles') return { data: [PROFILE], error: null };
        if (table === 'house_levy_history') return { data: op === 'select' && outcomeOf(hid!) === 'skipped' ? { id: 'hist' } : null, error: null };
        if (table === 'invoices' && op === 'insert') {
          invoiceInserts.push(payload!);
          return outcomeOf(payload!.house_id as string) === 'error'
            ? { data: null, error: { message: 'insert failed' } }
            : { data: { id: `inv-${payload!.house_id}` }, error: null };
        }
        if (table === 'invoices') return { data: [{ id: 'inv-first' }], count: sameDayLevyCount, error: null };
        return { data: null, error: null };
      };
      chain.select = () => chain;
      chain.insert = (p: Record<string, unknown>) => { op = 'insert'; payload = p; return chain; };
      chain.eq = (col: string, val: unknown) => { filters[col] = val; return chain; };
      for (const m of ['in', 'order', 'limit', 'gte', 'or']) chain[m] = () => chain;
      chain.single = async () => { if (table === 'houses') { op = 'single'; houseSingleReads++; } return settle(); };
      chain.maybeSingle = async () => settle();
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve);
      return chain;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invoiceInserts = [];
  houseSingleReads = 0;
  sameDayLevyCount = 0;
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.getSystemSetting.mockImplementation(async (_s: unknown, key: string) => (key === 'invoice_due_window_days' ? '"7"' : true));
  mocks.debit.mockResolvedValue({ success: false, amountDebited: 0 });
  mocks.createServerSupabaseClient.mockImplementation(async () => fakeSupabase());
});

describe('generateRetroactiveLevies (#778)', () => {
  it('keeps the generated, skipped and errors totals for mixed house outcomes', async () => {
    const res = await generateRetroactiveLevies();
    expect(res).toMatchObject({ success: true, generated: 4, skipped: 4 });
    expect(res.errors).toHaveLength(4);
    expect(res.errors.every((e) => e === 'Levy invoice for Gate levy: insert failed')).toBe(true);
  });

  it('reads auth, the user and each setting once per batch, not per house', async () => {
    await generateRetroactiveLevies();
    expect(mocks.authorizePermission).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    expect(mocks.getSystemSetting).toHaveBeenCalledTimes(2);
    expect(houseSingleReads).toBe(0);
  });

  it('bills each house to its own resident, with the batch due window', async () => {
    await generateRetroactiveLevies();
    expect(invoiceInserts).toHaveLength(8);
    const due = new Date();
    due.setDate(due.getDate() + 7);
    for (const insert of invoiceInserts) {
      expect(insert.resident_id).toBe(residentOf(insert.house_id as string));
      expect(insert.invoice_number).toContain((insert.house_id as string).substring(0, 8).toUpperCase());
      expect(insert.due_date).toBe(due.toISOString().split('T')[0]);
      expect(insert.created_by).toBe('user-1');
    }
  });

  it('suffixes the levy number when the house already has a levy number today (#1057)', async () => {
    sameDayLevyCount = 1;
    await generateRetroactiveLevies();
    for (const insert of invoiceInserts) {
      expect(insert.invoice_number).toMatch(/^LEV-\d{8}-[0-9A-F]{8}-2$/);
    }
  });

  it('generates nothing when auto levy generation is disabled', async () => {
    mocks.getSystemSetting.mockImplementation(async (_s: unknown, key: string) => (key === 'auto_generate_levies' ? false : '"7"'));
    const res = await generateRetroactiveLevies();
    expect(res).toMatchObject({ success: true, generated: 0, skipped: 0, errors: [] });
    expect(invoiceInserts).toHaveLength(0);
  });

  it('returns Unauthorized without BILLING_CREATE_INVOICE', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    expect(await generateRetroactiveLevies()).toEqual({ success: false, generated: 0, skipped: 0, errors: ['Unauthorized'] });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe('generateLeviesForHouse (#778)', () => {
  it('still checks permission, reads settings and the house itself', async () => {
    const res = await generateLeviesForHouse(houseId(2));
    expect(res).toMatchObject({ success: true, generated: 1, skipped: 0, errors: [] });
    expect(mocks.authorizePermission).toHaveBeenCalledTimes(1);
    expect(mocks.getSystemSetting).toHaveBeenCalledTimes(2);
    expect(houseSingleReads).toBe(1);
  });

  it('returns Unauthorized without BILLING_CREATE_INVOICE', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    expect(await generateLeviesForHouse(houseId(2))).toEqual({ success: false, generated: 0, skipped: 0, errors: ['Unauthorized'] });
    expect(invoiceInserts).toHaveLength(0);
  });
});
