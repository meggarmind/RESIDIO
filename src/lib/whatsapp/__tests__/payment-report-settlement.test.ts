import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { allocateWalletToInvoices } from '@/actions/billing/wallet';
import { closeReportedPayment, settleReportedPayment } from '@/lib/whatsapp/payment-report-settlement';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/actions/billing/wallet', () => ({ allocateWalletToInvoices: vi.fn() }));

type Call = { op: string; args: unknown[] };

function mockDb(results: unknown[]) {
  const calls: Call[] = [];
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'update', 'eq']) {
      chain[op] = vi.fn((...args: unknown[]) => {
        calls.push({ op, args });
        return chain;
      });
    }
    const next = () => results.shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (value: unknown) => unknown) => resolve(next());
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { calls, updates: () => calls.filter((call) => call.op === 'update').map((call) => call.args[0]) };
}

const pending = { id: 'payment-1', resident_id: 'resident-1', house_id: 'house-1', amount: 50000, payment_date: '2026-10-12T11:00:00+00:00', status: 'pending', is_verified: false };

beforeEach(() => {
  vi.mocked(allocateWalletToInvoices).mockReset().mockResolvedValue({ success: true, invoicesPaid: 1, totalAllocated: 50000, error: null });
});

describe('settleReportedPayment (approving a payment reported on WhatsApp)', () => {
  it('marks it paid and verified by the approver, then credits the wallet and allocates to invoices', async () => {
    const { updates } = mockDb([{ data: pending, error: null }, { data: { id: 'payment-1' }, error: null }]);

    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: true });

    expect(updates()[0]).toMatchObject({ status: 'paid', is_verified: true, verified_by: 'admin-1', verified_at: expect.any(String) });
    expect(allocateWalletToInvoices).toHaveBeenCalledWith('resident-1', 'house-1', '2026-10-12', {
      sourcePaymentId: 'payment-1',
      batchAmount: 50000,
      batchType: 'payment_received',
      creditAmount: 50000,
    });
  });

  it('only claims a payment that is still pending', async () => {
    const { calls } = mockDb([{ data: pending, error: null }, { data: { id: 'payment-1' }, error: null }]);
    await settleReportedPayment('payment-1', 'admin-1');
    expect(calls).toContainEqual({ op: 'eq', args: ['status', 'pending'] });
  });

  it('does not credit the wallet twice when the payment is already paid and verified', async () => {
    mockDb([{ data: { ...pending, status: 'paid', is_verified: true }, error: null }]);
    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: true });
    expect(allocateWalletToInvoices).not.toHaveBeenCalled();
  });

  it('refuses a payment that was rejected, or has gone', async () => {
    mockDb([{ data: { ...pending, status: 'failed' }, error: null }]);
    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: false, error: 'The reported payment is failed, not pending' });
    mockDb([{ data: null, error: null }]);
    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: false, error: 'The reported payment was not found' });
    expect(allocateWalletToInvoices).not.toHaveBeenCalled();
  });

  it('credits nothing when someone else changed the payment first', async () => {
    mockDb([{ data: pending, error: null }, { data: null, error: null }]);
    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: false, error: 'The reported payment was changed by someone else' });
    expect(allocateWalletToInvoices).not.toHaveBeenCalled();
  });

  it('puts the payment back to pending when the wallet cannot be credited, so the approval can be retried', async () => {
    vi.mocked(allocateWalletToInvoices).mockResolvedValue({ success: false, invoicesPaid: 0, totalAllocated: 0, error: 'rpc failed' });
    const { updates } = mockDb([{ data: pending, error: null }, { data: { id: 'payment-1' }, error: null }, { error: null }]);

    expect(await settleReportedPayment('payment-1', 'admin-1')).toEqual({ success: false, error: 'The wallet could not be credited: rpc failed' });
    expect(updates()[1]).toEqual({ status: 'pending', is_verified: false, verified_at: null, verified_by: null });
  });
});

describe('closeReportedPayment (rejecting or expiring a payment reported on WhatsApp)', () => {
  it('closes a pending report as failed and frees its duplicate key', async () => {
    const { calls, updates } = mockDb([{ error: null }]);
    await closeReportedPayment('payment-1');
    expect(updates()).toEqual([{ status: 'failed', whatsapp_report_key: null }]);
    expect(calls).toContainEqual({ op: 'eq', args: ['status', 'pending'] });
  });

  it('does not throw when the update fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDb([{ error: { message: 'denied' } }]);
    await expect(closeReportedPayment('payment-1')).resolves.toBeUndefined();
  });
});
