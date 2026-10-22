import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'whsec_test_secret';

const state = vi.hoisted(() => ({
  transaction: null as Record<string, unknown> | null,
  inserted: [] as Record<string, unknown>[],
  updates: [] as { table: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === 'paystack_transactions'
              ? { data: state.transaction, error: state.transaction ? null : { message: 'none' } }
              : { data: { first_name: 'Ada', last_name: 'Obi' }, error: null },
        }),
      }),
      update: (data: Record<string, unknown>) => {
        state.updates.push({ table, data });
        return { eq: async () => ({ error: null }) };
      },
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'pay-1' }, error: null }) }) };
      },
    }),
  }),
}));
vi.mock('@/actions/billing/wallet', () => ({
  creditWallet: vi.fn().mockResolvedValue({ success: true }),
  allocateWalletToInvoices: vi.fn().mockResolvedValue({ success: true, invoicesPaid: 0, totalAllocated: 0 }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));

import { processPaystackWebhook } from '../webhook-handler';
import { allocateWalletToInvoices, creditWallet } from '@/actions/billing/wallet';
import { logAudit } from '@/lib/audit/logger';

const sign = (body: string) => createHmac('sha512', SECRET).update(body).digest('hex');
const body = (event = 'charge.success') =>
  JSON.stringify({
    event,
    data: { reference: 'ref-1', amount: 150000, channel: 'card', paid_at: '2026-10-01T10:00:00Z' },
  });

describe('processPaystackWebhook (real handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', SECRET);
    state.inserted = [];
    state.updates = [];
    state.transaction = {
      id: 'tx-1',
      reference: 'ref-1',
      status: 'pending',
      payment_id: null,
      resident_id: 'res-1',
      house_id: 'house-1',
      invoice_id: null,
    };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a bad signature before touching the database', async () => {
    const result = await processPaystackWebhook(body(), 'bad');
    expect(result).toEqual({ success: false, error: 'Invalid webhook signature' });
    expect(state.inserted).toHaveLength(0);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it('creates the payment, credits the wallet in naira and audits on charge.success', async () => {
    const payload = body();
    const result = await processPaystackWebhook(payload, sign(payload));
    expect(result).toMatchObject({ success: true, action: 'payment_created', payment_id: 'pay-1' });
    expect(state.inserted[0]).toMatchObject({ amount: 1500, method: 'online', paystack_reference: 'ref-1' });
    expect(state.updates).toContainEqual({ table: 'paystack_transactions', data: { payment_id: 'pay-1' } });
    expect(creditWallet).toHaveBeenCalledWith('res-1', 1500, 'payment', 'pay-1', expect.any(String));
    expect(allocateWalletToInvoices).toHaveBeenCalledWith('res-1', 'house-1');
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('does not create a second payment for a redelivered success', async () => {
    state.transaction = { ...state.transaction, status: 'success', payment_id: 'pay-1' };
    const payload = body();
    const result = await processPaystackWebhook(payload, sign(payload));
    expect(result).toMatchObject({ success: true, action: 'already_processed' });
    expect(state.updates).toHaveLength(0);
    expect(state.inserted).toHaveLength(0);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it('still creates the payment when the transaction is marked success but has no payment yet', async () => {
    state.transaction = { ...state.transaction, status: 'success', payment_id: null };
    const payload = body();
    const result = await processPaystackWebhook(payload, sign(payload));
    expect(result).toMatchObject({ success: true, action: 'payment_created' });
    expect(state.inserted).toHaveLength(1);
  });

  it('marks the transaction failed on charge.failed without creating a payment', async () => {
    const payload = body('charge.failed');
    const result = await processPaystackWebhook(payload, sign(payload));
    expect(result).toMatchObject({ success: true, action: 'status_updated' });
    expect(state.updates[0].data).toMatchObject({ status: 'failed' });
    expect(state.inserted).toHaveLength(0);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it('reports an unknown reference as a failure', async () => {
    state.transaction = null;
    const payload = body();
    expect(await processPaystackWebhook(payload, sign(payload))).toEqual({
      success: false,
      error: 'Transaction not found',
    });
  });

  it('ignores other event types', async () => {
    const payload = body('transfer.success');
    expect(await processPaystackWebhook(payload, sign(payload))).toEqual({ success: true, action: 'ignored' });
  });
});
