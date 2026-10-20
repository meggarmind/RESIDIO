/**
 * #812: bulkVerifyPayments verifies the unverified payments in a selection, one audit entry each.
 * Mirrors the mock builder in verified-payment-lock.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; payload: unknown; filters: unknown[][] };
const updates: Call[] = [];
const results: Record<string, unknown> = {};
const audit = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined);
const revalidatePath = vi.fn();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  let op = 'select';
  const filters: unknown[][] = [];
  for (const m of ['eq', 'in']) b[m] = vi.fn((...a: unknown[]) => { filters.push([m, ...a]); return b; });
  b.select = vi.fn(() => b);
  b.update = vi.fn((payload: unknown) => { op = 'update'; updates.push({ table, payload, filters }); return b; });
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve(results[`${table}:${op}`] ?? { data: null, error: null });
  return b;
}
const supabase = {
  from: vi.fn((t: string) => makeBuilder(t)),
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
};

const authorize = vi.fn<(...args: unknown[]) => Promise<{ authorized: boolean }>>(async () => ({ authorized: true }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(async () => supabase) }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: (...a: unknown[]) => authorize(...a) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: (...a: unknown[]) => audit(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { bulkVerifyPayments } from '@/actions/finance/manual-verification';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  updates.length = 0;
  audit.mockClear();
  authorize.mockClear();
  revalidatePath.mockClear();
  supabase.from.mockClear();
  for (const k of Object.keys(results)) delete results[k];
});

describe('bulkVerifyPayments', () => {
  it('refuses a user without payments.verify, without touching the table', async () => {
    authorize.mockResolvedValueOnce({ authorized: false });
    const res = await bulkVerifyPayments([A]);
    expect(authorize).toHaveBeenCalledWith('payments.verify');
    expect(res.success).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty list', []],
    ['an oversize list', Array.from({ length: 501 }, () => A)],
    ['a non-uuid id', ['not-a-uuid']],
  ])('rejects %s before any query', async (_n, ids) => {
    const res = await bulkVerifyPayments(ids);
    expect(res.success).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('verifies only the unverified rows in one update and audits each one', async () => {
    results['payment_records:select'] = {
      data: [{ id: A, is_verified: false }, { id: B, is_verified: true }, { id: C, is_verified: false }],
      error: null,
    };
    results['payment_records:update'] = {
      data: [{ id: A, reference_number: 'R-A' }, { id: C, reference_number: null }],
      error: null,
    };

    const res = await bulkVerifyPayments([A, B, C], 'checked against ledger');

    expect(res).toMatchObject({ success: true, verifiedCount: 2, skippedCount: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ is_verified: true, verified_by: 'user-1' });
    expect(typeof (updates[0].payload as { verified_at: unknown }).verified_at).toBe('string');
    expect(updates[0].filters).toContainEqual(['in', 'id', [A, C]]);
    expect(updates[0].filters).toContainEqual(['eq', 'is_verified', false]);

    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'VERIFY', entityType: 'payment_records', entityId: A, entityDisplay: 'Payment: R-A',
      newValues: expect.objectContaining({ is_verified: true, verified_by: 'user-1', notes: 'checked against ledger' }),
    }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VERIFY', entityId: C }));
    expect(revalidatePath).toHaveBeenCalledWith('/payments');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('refuses a selection that is all verified, without an update', async () => {
    results['payment_records:select'] = { data: [{ id: A, is_verified: true }], error: null };
    const res = await bulkVerifyPayments([A]);
    expect(res.success).toBe(false);
    expect(updates).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it('fails closed when the rows cannot be loaded', async () => {
    results['payment_records:select'] = { data: null, error: { message: 'boom' } };
    const res = await bulkVerifyPayments([A]);
    expect(res.success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('writes no audit entry when the update fails', async () => {
    results['payment_records:select'] = { data: [{ id: A, is_verified: false }], error: null };
    results['payment_records:update'] = { data: null, error: { message: 'boom' } };
    const res = await bulkVerifyPayments([A]);
    expect(res.success).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });
});
