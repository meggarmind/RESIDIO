import { describe, expect, it, vi } from 'vitest';
import { DEBT_STATUS_DEFAULTS, getDebtStatuses, parseDebtStatusSettings } from '@/lib/billing/debt-status';

/**
 * #980: the TypeScript wrapper around get_debt_statuses. The status rule itself is SQL
 * (supabase/migrations/20261022180000_debt_status.sql) and Vitest has no database: the rule was driven
 * against a throwaway PGlite outside the worktree, each status, the threshold boundary (3 owed is
 * Outstanding, 4 is Arrears), a part-paid invoice, wallet credit with and without debt, future, void
 * and paid invoices, the billed-resident wallet and the threshold setting, and it must be re-checked on
 * Residio_Stage after the migration is applied (VERIFY block in the migration).
 */

type Rpc = { data: unknown; error: { message: string } | null };

function client(rpc: Rpc, settings: { key: string; value: unknown }[] = []) {
  const rpcFn = vi.fn().mockResolvedValue(rpc);
  const inFn = vi.fn().mockResolvedValue({ data: settings, error: null });
  const from = vi.fn(() => ({ select: () => ({ in: inFn }) }));
  return { supabase: { rpc: rpcFn, from } as never, rpcFn, from };
}

const row = (house_id: string, status: string, owed: number | string, wallet: number | string, resident_id: string | null = 'r1') => ({
  house_id,
  resident_id,
  status,
  owed_invoice_count: owed,
  wallet_balance: wallet,
});

describe('getDebtStatuses', () => {
  it('maps each row and labels it with the saved label, numbers as numbers', async () => {
    const { supabase } = client(
      {
        data: [row('h1', 'arrears', 4, '0.00'), row('h2', 'outstanding', '1', 0), row('h3', 'credit', 0, '250.50'), row('h4', 'paid_in_full', 0, 0, null)],
        error: null,
      },
      [{ key: 'debt_status_label_arrears', value: 'Owing a lot' }],
    );
    expect(await getDebtStatuses(supabase, { houseIds: ['h1', 'h2', 'h3', 'h4'] })).toEqual([
      { houseId: 'h1', residentId: 'r1', status: 'arrears', label: 'Owing a lot', owedInvoiceCount: 4, walletBalance: 0 },
      { houseId: 'h2', residentId: 'r1', status: 'outstanding', label: 'Outstanding', owedInvoiceCount: 1, walletBalance: 0 },
      { houseId: 'h3', residentId: 'r1', status: 'credit', label: 'Credit', owedInvoiceCount: 0, walletBalance: 250.5 },
      { houseId: 'h4', residentId: null, status: 'paid_in_full', label: 'Paid in Full', owedInvoiceCount: 0, walletBalance: 0 },
    ]);
  });

  it('passes the houses and resident to the one database function, null when omitted', async () => {
    const { supabase, rpcFn } = client({ data: [], error: null });
    await getDebtStatuses(supabase);
    expect(rpcFn).toHaveBeenLastCalledWith('get_debt_statuses', { p_house_ids: null, p_resident_id: null });
    await getDebtStatuses(supabase, { houseIds: ['h1'], residentId: 'r9' });
    expect(rpcFn).toHaveBeenLastCalledWith('get_debt_statuses', { p_house_ids: ['h1'], p_resident_id: 'r9' });
  });

  it('answers an empty house list without a query (null would mean every house)', async () => {
    const { supabase, rpcFn } = client({ data: [], error: null });
    expect(await getDebtStatuses(supabase, { houseIds: [] })).toEqual([]);
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it('throws when the function fails', async () => {
    const { supabase } = client({ data: null, error: { message: 'boom' } });
    await expect(getDebtStatuses(supabase, { houseIds: ['h1'] })).rejects.toThrow('Debt status could not be read: boom');
  });
});

describe('parseDebtStatusSettings', () => {
  it('reads the defaults when nothing is stored', () => {
    expect(parseDebtStatusSettings([])).toEqual(DEBT_STATUS_DEFAULTS);
  });

  it('reads stored values, numbers stored as text included', () => {
    expect(
      parseDebtStatusSettings([
        { key: 'debt_status_label_credit', value: ' Paid ahead ' },
        { key: 'debt_status_arrears_threshold_months', value: '6' },
        { key: 'debt_status_report_footnote', value: 'Call the office.' },
        { key: 'debt_status_chat_pdf_house_limit', value: 25 },
      ]),
    ).toEqual({
      ...DEBT_STATUS_DEFAULTS,
      labels: { ...DEBT_STATUS_DEFAULTS.labels, credit: 'Paid ahead' },
      arrearsThresholdMonths: 6,
      reportFootnote: 'Call the office.',
      chatPdfHouseLimit: 25,
    });
  });

  it('keeps the default for an invalid stored value', () => {
    expect(
      parseDebtStatusSettings([
        { key: 'debt_status_label_arrears', value: '' },
        { key: 'debt_status_arrears_threshold_months', value: 0 },
        { key: 'debt_status_chat_pdf_house_limit', value: 'many' },
      ]),
    ).toEqual(DEBT_STATUS_DEFAULTS);
  });
});
