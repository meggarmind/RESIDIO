import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOverdueInvoiceAging } from '@/actions/billing/check-overdue-invoices';
import { getContactVerificationStats } from '@/actions/residents/get-resident-stats';
import { getFinancialOverview } from '@/actions/reports/get-financial-overview';

const { createServerSupabaseClient, authorizePermission } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));

// Each action must aggregate in SQL (#776): any from() call means rows are being downloaded again.
function mockRpc(result: { data: unknown; error: { message: string } | null }) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const from = vi.fn();
  const rpc = vi.fn((name: string, args?: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(result);
  });
  createServerSupabaseClient.mockResolvedValue({ from, rpc });
  return { rpcCalls, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizePermission.mockResolvedValue({ authorized: true });
});

describe('getOverdueInvoiceAging', () => {
  it('maps SQL buckets to the old shape, sorted by days, above 1000 invoices', async () => {
    const { rpcCalls, from } = mockRpc({
      data: [
        { days_overdue: 30, count: '1200' },
        { days_overdue: 1, count: 5 },
      ],
      error: null,
    });

    const { data, error } = await getOverdueInvoiceAging();

    expect(error).toBeNull();
    expect(data).toEqual([
      { daysOverdue: 1, count: 5 },
      { daysOverdue: 30, count: 1200 },
    ]);
    expect(rpcCalls[0].name).toBe('get_overdue_invoice_aging');
    expect(rpcCalls[0].args?.p_today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns an empty list when nothing is overdue', async () => {
    mockRpc({ data: [], error: null });
    expect(await getOverdueInvoiceAging()).toEqual({ data: [], error: null });
  });

  it('propagates the error', async () => {
    mockRpc({ data: null, error: { message: 'boom' } });
    expect(await getOverdueInvoiceAging()).toEqual({ data: null, error: 'boom' });
  });
});

describe('getContactVerificationStats', () => {
  it('derives partial from the SQL counts and keeps the return shape', async () => {
    const { rpcCalls, from } = mockRpc({ data: { verified: 700, unverified: 400, total: 1500 }, error: null });

    const { data, error } = await getContactVerificationStats();

    expect(error).toBeNull();
    expect(data).toEqual({ verified: 700, unverified: 400, partial: 400, total: 1500 });
    expect(rpcCalls[0].name).toBe('get_contact_verification_stats');
    expect(from).not.toHaveBeenCalled();
  });

  it('reports zeros for no active residents', async () => {
    mockRpc({ data: { verified: 0, unverified: 0, total: 0 }, error: null });
    const { data } = await getContactVerificationStats();
    expect(data).toEqual({ verified: 0, unverified: 0, partial: 0, total: 0 });
  });

  it('propagates the error', async () => {
    mockRpc({ data: null, error: { message: 'boom' } });
    expect(await getContactVerificationStats()).toEqual({ data: null, error: 'boom' });
  });
});

describe('getFinancialOverview', () => {
  const params = { startDate: '2026-01-01', endDate: '2026-12-31' };

  it('maps summary and per-tag totals, passing filters through', async () => {
    const { rpcCalls, from } = mockRpc({
      data: {
        total_credits: '150000.50',
        total_debits: '20000.25',
        transaction_count: 2500,
        by_tag: [
          { tag_id: 't1', tag_name: 'Dues', tag_color: 'green', transaction_type: 'credit', count: 2400, total: '150000.50' },
          { tag_id: null, tag_name: 'Untagged', tag_color: 'gray', transaction_type: 'debit', count: 100, total: '20000.25' },
        ],
      },
      error: null,
    });

    const result = await getFinancialOverview({ ...params, bankAccountId: 'acc-1', transactionType: 'debit' });

    expect(result.error).toBeUndefined();
    expect(result.summary).toEqual({
      totalCredits: 150000.5,
      totalDebits: 20000.25,
      netBalance: 130000.25,
      transactionCount: 2500,
    });
    expect(result.byTag).toEqual([
      { tagId: 't1', tagName: 'Dues', tagColor: 'green', transactionType: 'credit', count: 2400, total: 150000.5 },
      { tagId: null, tagName: 'Untagged', tagColor: 'gray', transactionType: 'debit', count: 100, total: 20000.25 },
    ]);
    expect(rpcCalls[0]).toEqual({
      name: 'get_financial_overview',
      args: { p_start_date: '2026-01-01', p_end_date: '2026-12-31', p_bank_account_id: 'acc-1', p_transaction_type: 'debit' },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("sends null filters for 'all' and no bank account", async () => {
    const { rpcCalls } = mockRpc({
      data: { total_credits: 0, total_debits: 0, transaction_count: 0, by_tag: [] },
      error: null,
    });

    const result = await getFinancialOverview({ ...params, transactionType: 'all' });

    expect(rpcCalls[0].args).toMatchObject({ p_bank_account_id: null, p_transaction_type: null });
    expect(result.summary).toEqual({ totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 });
    expect(result.byTag).toEqual([]);
  });

  it('propagates the error with zeroed totals', async () => {
    mockRpc({ data: null, error: { message: 'boom' } });
    const result = await getFinancialOverview(params);
    expect(result.error).toBe('boom');
    expect(result.summary.transactionCount).toBe(0);
  });

  it('stops before querying when unauthorized', async () => {
    const { rpcCalls } = mockRpc({ data: null, error: null });
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    const result = await getFinancialOverview(params);
    expect(result.error).toBe('Forbidden');
    expect(rpcCalls).toHaveLength(0);
  });
});
