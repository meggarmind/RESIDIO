import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), setting: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.client,
  createAdminClient: mocks.client,
}));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: mocks.setting }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));

import { runLateFeeApplication } from '../apply-late-fees';

const INVOICE = { id: 'inv-1', invoice_number: 'INV-1', amount_due: 1000, due_date: '2020-01-01', status: 'unpaid', invoice_items: [] };
let invoiceUpdates: number;

function fakeSupabase(insertError: { code: string; message: string } | null) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'lt', 'order', 'insert', 'delete']) chain[m] = () => chain;
      chain.update = () => { invoiceUpdates++; return chain; };
      chain.single = async () => ({ data: insertError ? null : { id: 'item-1' }, error: insertError });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'invoices' ? [INVOICE] : [], error: null }).then(resolve);
      return chain;
    },
  };
}

beforeEach(() => {
  invoiceUpdates = 0;
  mocks.setting.mockImplementation(async (key: string) => (key === 'late_fee_enabled' ? true : null));
});

describe('runLateFeeApplication duplicate guard (#1057)', () => {
  it('treats a unique-violation on the late-fee item as already applied', async () => {
    mocks.client.mockReturnValue(fakeSupabase({ code: '23505', message: 'duplicate key' }));
    const res = await runLateFeeApplication('cron');
    expect(res).toMatchObject({ applied: 0, skippedAlreadyApplied: 1, errors: [] });
    expect(invoiceUpdates).toBe(0);
  });

  it('applies the fee when the insert succeeds', async () => {
    mocks.client.mockReturnValue(fakeSupabase(null));
    const res = await runLateFeeApplication('cron');
    expect(res).toMatchObject({ applied: 1, skippedAlreadyApplied: 0 });
  });
});
