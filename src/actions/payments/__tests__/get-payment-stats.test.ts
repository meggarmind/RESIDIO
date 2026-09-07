import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaymentStats } from '@/actions/payments/get-payment-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

function mockPaymentRecords(rows: Array<{ status: string; amount: number }>) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => ({ select })) });
  return select;
}

describe('getPaymentStats', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it('counts every paid row as completed when nothing is pending (issue #114 regression)', async () => {
    // This is the exact case the original bug got wrong: the "Completed" card
    // used to hardcode '0' whenever stats.pending_count was 0, even though the
    // dataset held nothing but paid rows (today's live data: 2259 paid, 0 pending).
    const rows = Array.from({ length: 2259 }, () => ({ status: 'paid', amount: 100 }));
    mockPaymentRecords(rows);

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.paid_count).toBe(2259);
    expect(stats?.pending_count).toBe(0);
    expect(stats?.total_count).toBe(2259);
  });

  it('sums total_collected from paid rows only', async () => {
    mockPaymentRecords([
      { status: 'paid', amount: 500 },
      { status: 'paid', amount: 250 },
      { status: 'pending', amount: 1000 },
      { status: 'failed', amount: 750 },
    ]);

    const { stats } = await getPaymentStats();

    expect(stats?.total_collected).toBe(750);
    expect(stats?.paid_count).toBe(2);
    expect(stats?.pending_count).toBe(1);
    expect(stats?.failed_count).toBe(1);
    expect(stats?.total_count).toBe(4);
  });

  it('counts overdue rows separately, since payment_status is a real, DB-admitted value', async () => {
    // Verified live against the Supabase payment_status enum (pg_enum):
    // {pending, paid, overdue, failed} -- all four are storable by the column.
    // No row happens to carry 'overdue' today, but the status is reachable
    // (payment-form.tsx exposes it, payment-table.tsx bulk-updates to it), so
    // counting it here is correct, not dead code counting an impossible value.
    mockPaymentRecords([
      { status: 'paid', amount: 100 },
      { status: 'overdue', amount: 200 },
    ]);

    const { stats } = await getPaymentStats();

    expect(stats?.overdue_count).toBe(1);
    expect(stats?.paid_count).toBe(1);
  });

  it('propagates a fetch error without computing stats', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => ({ select })) });

    const { stats, error } = await getPaymentStats();

    expect(stats).toBeNull();
    expect(error).toBe('boom');
  });
});
