import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

// Well above the PostgREST 1000-row cap: the aggregate must not depend on row downloads (#459, #215).
const PAYMENT_ROWS = 2500;

function makeClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const fromTables: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      fromTables.push(table);
      const query: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'or', 'order', 'limit', 'range']) {
        query[m] = vi.fn(() => query);
      }
      query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  };
  return { client, fromTables, rpcCalls };
}

describe('getDashboardStats money totals via server-side aggregate (#459, #215)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports totals above 1000 rows from the RPC without downloading payment rows', async () => {
    const { client, fromTables, rpcCalls } = makeClient({
      data: {
        collected_count: PAYMENT_ROWS,
        collected_total: PAYMENT_ROWS * 10,
        unverified_count: PAYMENT_ROWS - 5,
        unverified_total: '24950.50',
      },
      error: null,
    });
    createServerSupabaseClient.mockResolvedValue(client);

    const { data, error } = await getDashboardStats();

    expect(error).toBeNull();
    expect(data?.paymentsThisMonth).toBe(PAYMENT_ROWS);
    expect(data?.paymentsThisMonthAmount).toBe(PAYMENT_ROWS * 10);
    expect(data?.unverifiedPaymentsCount).toBe(PAYMENT_ROWS - 5);
    expect(data?.unverifiedPaymentsAmount).toBe(24950.5);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe('get_dashboard_payment_metrics');
    expect(rpcCalls[0].args.p_month_start).toMatch(/^\d{4}-\d{2}-01$/);
    expect(rpcCalls[0].args.p_month_end).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
    // The two money metrics must not read payment_records rows; only the recent-activity read may.
    expect(fromTables.filter((t) => t === 'payment_records')).toHaveLength(1);
  });

  it('fails the whole read on RPC error instead of returning partial numbers', async () => {
    const { client } = makeClient({ data: null, error: { message: 'boom' } });
    createServerSupabaseClient.mockResolvedValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getDashboardStats();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Failed to fetch dashboard stats');
  });
});

describe('static: dashboard payment metrics migration (#215)', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261013100000_dashboard_payment_metrics.sql', import.meta.url),
    'utf8',
  );
  const code = sql.replace(/--.*$/gm, '');

  it('is SECURITY INVOKER, STABLE, with a pinned search_path', () => {
    expect(code).toContain('SECURITY INVOKER');
    expect(code).not.toContain('SECURITY DEFINER');
    expect(code).toContain('STABLE');
    expect(code).toContain('SET search_path = public');
  });

  it('revokes from PUBLIC and anon and grants only authenticated and service_role', () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_payment_metrics\(date, date\) FROM PUBLIC;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_payment_metrics\(date, date\) FROM anon;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_dashboard_payment_metrics\(date, date\) TO authenticated, service_role;/);
  });

  it('documents the rollback', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_dashboard_payment_metrics(date, date);');
  });

  it('uses the same filters as the dashboard action and every status literal exists in the enum', () => {
    const ts = readFileSync(new URL('../actions/dashboard/get-dashboard-stats.ts', import.meta.url), 'utf8');
    expect(ts).toContain("rpc('get_dashboard_payment_metrics'");

    const baseline = readFileSync(
      new URL('../../supabase/migrations/20251208000200_create_payment_records.sql', import.meta.url),
      'utf8',
    );
    const enumMatch = baseline.match(/CREATE TYPE payment_status AS ENUM \(([^)]*)\)/);
    expect(enumMatch).not.toBeNull();
    const allowed = new Set([...enumMatch![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));

    const used = [...code.matchAll(/status\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const v of used) expect(allowed.has(v), `status '${v}' must exist in payment_status`).toBe(true);
    expect(new Set(used)).toEqual(new Set(['paid']));

    // collected: dated window inclusive on both ends; unverified: is_verified = false, no date bound
    expect(code).toContain('payment_date >= p_month_start');
    expect(code).toContain('payment_date <= p_month_end');
    expect(code).toContain("status = 'paid' AND is_verified = false");
  });
});
