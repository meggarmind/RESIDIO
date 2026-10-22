import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statuses: [] as { house_id: string; status: string; owed_invoice_count: number }[],
}));

const house = (id: string) => ({ house_id: id, is_active: id === 'h1', house: { id, house_number: id, street: { name: 'Palm' } } });

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      if (table === 'resident_houses') return { select: () => ({ eq: async () => ({ data: [house('h1'), house('h2')], error: null }) }) };
      if (table === 'system_settings') return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      return { select: () => ({ eq: () => ({ neq: () => ({ in: async () => ({ data: [
        { house_id: 'h2', amount_due: 100, amount_paid: 0, status: 'unpaid' },
      ], error: null }) }) }) }) };
    },
    rpc: async () => ({
      data: mocks.statuses.map((s) => ({ ...s, resident_id: 'r1', wallet_balance: 0 })),
      error: null,
    }),
  }),
}));

import { getResidentPropertiesForPayment } from '@/actions/payments/get-resident-properties-for-payment';

beforeEach(() => { mocks.statuses = []; });

describe('getResidentPropertiesForPayment debt status (#983)', () => {
  it.each([
    ['outstanding', 3, true],
    ['arrears', 4, true],
    ['paid_in_full', 0, false],
    ['credit', 0, false],
  ])('previous property in %s (%i owed invoices) sets hasPreviousPropertyDebts=%s', async (status, owed, flagged) => {
    mocks.statuses = [{ house_id: 'h2', status, owed_invoice_count: owed }];
    const result = await getResidentPropertiesForPayment('r1');
    const prev = result.data?.find((p) => p.houseId === 'h2');
    expect(prev?.debtStatus).toBe(status);
    expect(prev?.debtStatusLabel).toBe({ outstanding: 'Outstanding', arrears: 'Arrears', paid_in_full: 'Paid in Full', credit: 'Credit' }[status]);
    expect(result.hasPreviousPropertyDebts).toBe(flagged);
  });
});
