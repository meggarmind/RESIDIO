/**
 * #502: a verified payment's amount, resident, house and status are frozen.
 * Mirrors the mock builder in update-action-allowlists.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; payload: unknown };
const updates: Call[] = [];
const results: Record<string, unknown> = {};
const audit = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined);

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  let op = 'select';
  for (const m of ['eq', 'select', 'in']) b[m] = vi.fn(() => b);
  b.update = vi.fn((payload: unknown) => { op = 'update'; updates.push({ table, payload }); return b; });
  b.single = vi.fn(async () => results[table] ?? { data: null, error: null });
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
vi.mock('@/lib/audit/logger', () => ({
  logAudit: (...a: unknown[]) => audit(...a),
  getChangedValues: vi.fn(() => ({ old: {}, new: {} })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const stored = (over: Record<string, unknown> = {}) => ({
  id: A, resident_id: B, house_id: C, amount: '5000.00', status: 'paid',
  is_verified: true, notes: 'n', reference_number: 'R1', ...over,
});
const paymentUpdates = () => updates.filter((u) => u.table === 'payment_records').map((u) => u.payload as Record<string, unknown>);

beforeEach(() => {
  updates.length = 0;
  audit.mockClear();
  authorize.mockClear();
  for (const k of Object.keys(results)) delete results[k];
});

describe('updatePayment on a verified payment', () => {
  it.each([
    ['amount', { amount: 6000 }],
    ['resident', { resident_id: D }],
    ['house', { house_id: D }],
    ['status', { status: 'failed' as const }],
  ])('refuses a changed %s without calling .update()', async (_n, patch) => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = { data: stored(), error: null };
    const res = await updatePayment(A, patch as never);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Un-verify/);
    expect(paymentUpdates()).toHaveLength(0);
  });

  it('accepts the form re-sending unchanged locked values with edited notes/reference', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = { data: stored(), error: null };
    const res = await updatePayment(A, {
      amount: 5000, status: 'paid', resident_id: B, house_id: C, notes: 'edited', reference_number: 'R2',
    });
    expect(res.success).toBe(true);
    expect(paymentUpdates()[0]).toMatchObject({ notes: 'edited', reference_number: 'R2' });
  });

  it('accepts notes/reference-only edits', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = { data: stored(), error: null };
    const res = await updatePayment(A, { notes: 'x' });
    expect(res.success).toBe(true);
    expect(paymentUpdates()).toEqual([{ notes: 'x' }]);
  });
});

describe('updatePayment fails closed when the stored record cannot be read', () => {
  it.each([
    ['an error', { data: null, error: { message: 'boom' } }],
    ['no row', { data: null, error: null }],
  ])('refuses with %s and never writes', async (_n, result) => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = result;
    const res = await updatePayment(A, { amount: 6000 });
    expect(res.success).toBe(false);
    expect(paymentUpdates()).toHaveLength(0);
  });
});

describe('bulkUpdatePayments and verified payments', () => {
  const bulk = async (ids: string[]) => {
    const { bulkUpdatePayments } = await import('@/actions/payments/bulk-update-payments');
    return bulkUpdatePayments({ ids, status: 'failed' });
  };

  it('updates only the unverified ids and reports the skipped count', async () => {
    results['payment_records:select'] = {
      data: [{ id: A, status: 'paid', is_verified: true }, { id: B, status: 'paid', is_verified: false }],
      error: null,
    };
    results['payment_records:update'] = { data: [{ id: B }], error: null };
    const res = (await bulk([A, B])) as { success?: boolean; updatedCount?: number; skippedCount?: number; message?: string };
    expect(res.success).toBe(true);
    expect(res.skippedCount).toBe(1);
    expect(res.message).toMatch(/skipped 1 verified/);
    expect(supabase.from).toHaveBeenCalled();
    const inCalls = (supabase.from.mock.results.at(-1)!.value as { in: ReturnType<typeof vi.fn> }).in.mock.calls;
    expect(inCalls[0][1]).toEqual([B]);
  });

  it('refuses, without writing, when every selected payment is verified', async () => {
    results['payment_records:select'] = { data: [{ id: A, status: 'paid', is_verified: true }], error: null };
    const res = (await bulk([A])) as { error?: string };
    expect(res.error).toMatch(/verified/);
    expect(paymentUpdates()).toHaveLength(0);
  });

  it('fails closed when the selection cannot be read', async () => {
    results['payment_records:select'] = { data: null, error: { message: 'boom' } };
    const res = (await bulk([A])) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(paymentUpdates()).toHaveLength(0);
  });
});

describe('updatePayment on an unverified payment', () => {
  it('still edits amount and status', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = { data: stored({ is_verified: false }), error: null };
    const res = await updatePayment(A, { amount: 6000, status: 'failed' });
    expect(res.success).toBe(true);
    expect(paymentUpdates()[0]).toEqual({ amount: 6000, status: 'failed' });
  });
});

describe('unverifyPayment', () => {
  it('clears verification, audits, and uses the verify permission', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    results['payment_records'] = { data: stored({ verified_by: 'u9' }), error: null };
    const res = await unverifyPayment(A, 'wrong amount');
    expect(res.success).toBe(true);
    expect(authorize).toHaveBeenCalledWith('payments.verify');
    expect(paymentUpdates()[0]).toMatchObject({ is_verified: false, verified_at: null, verified_by: null });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'payment_records', entityId: A, newValues: expect.objectContaining({ is_verified: false }),
    }));
  });

  it('records in the audit entry that a bank-matched payment was bank-matched', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    results['payment_records'] = { data: stored({ bank_row_id: 'row-9' }), error: null };
    expect((await unverifyPayment(A)).success).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      oldValues: expect.objectContaining({ bank_row_id: 'row-9' }),
      newValues: expect.objectContaining({ was_bank_matched: true }),
    }));
  });

  it('refuses when unauthorized, without touching the table', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    authorize.mockResolvedValueOnce({ authorized: false });
    const res = await unverifyPayment(A);
    expect(res.success).toBe(false);
    expect(paymentUpdates()).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses an unverified payment', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    results['payment_records'] = { data: stored({ is_verified: false }), error: null };
    expect((await unverifyPayment(A)).success).toBe(false);
    expect(paymentUpdates()).toHaveLength(0);
  });

  it('unverify then edit succeeds', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    const { updatePayment } = await import('@/actions/payments/update-payment');
    results['payment_records'] = { data: stored(), error: null };
    expect((await updatePayment(A, { amount: 6000 })).success).toBe(false);
    await unverifyPayment(A);
    results['payment_records'] = { data: stored({ is_verified: false }), error: null };
    expect((await updatePayment(A, { amount: 6000 })).success).toBe(true);
  });
});

describe('payment verification audit display (#893)', () => {
  it('manuallyVerifyPayment names the payment by its reference number', async () => {
    const { manuallyVerifyPayment } = await import('@/actions/finance/manual-verification');
    results['payment_records'] = { data: stored({ is_verified: false }), error: null };
    expect((await manuallyVerifyPayment(A)).success).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityDisplay: 'Payment: R1' }));
  });

  it('unverifyPayment names the payment by its reference number', async () => {
    const { unverifyPayment } = await import('@/actions/finance/manual-verification');
    results['payment_records'] = { data: stored(), error: null };
    expect((await unverifyPayment(A)).success).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ entityDisplay: 'Payment: R1' }));
  });
});
