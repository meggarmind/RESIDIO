import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  tables: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  calls: [] as Array<[string, string, unknown[]]>,
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async (p: string) =>
    mocks.permissions.includes(p) ? { authorized: true } : { authorized: false, error: 'Unauthorized' },
}));
vi.mock('@/lib/email-imports/auto-record', () => ({ readEmailAutoProcessLimit: async () => 60000 }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) {
        b[m] = (...args: unknown[]) => {
          mocks.calls.push([table, m, args]);
          return b;
        };
      }
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(mocks.tables[table]).then(resolve);
      return b;
    },
  }),
}));

import { getAwaitingVerification } from '@/actions/payments/awaiting-verification';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const ALERT = {
  id: 'tx-1',
  email_import_id: 'imp-1',
  amount: '5000',
  transaction_type: 'credit',
  transaction_date: '2026-11-01',
  created_at: '2026-11-01T10:00:00Z',
  description: 'NIP FROM JOHN DOE',
  bank_account_last4: '1234',
  email_messages: { sender_verified: true },
};
const PAYMENT = {
  id: 'pay-1',
  amount: 2000,
  payment_date: '2026-11-01',
  created_at: '2026-11-01T09:00:00Z',
  notes: null,
  status: 'paid',
  approval_request_id: null,
  house: { short_name: 'A1', house_number: '1' },
  resident: { first_name: 'Ada', last_name: 'Obi' },
};
const REPORT = { ...PAYMENT, id: 'pay-report', status: 'pending', approval_request_id: 'appr-1' };
// pending without an approval request is a payment an admin recorded, so it stays.
const PENDING_RECORDED = { ...PAYMENT, id: 'pay-pending', status: 'pending', approval_request_id: null };

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_PROCESS, PERMISSIONS.PAYMENTS_VERIFY];
  mocks.calls = [];
  mocks.tables = {
    email_transactions: { data: [ALERT], error: null },
    payment_records: { data: [PAYMENT, REPORT, PENDING_RECORDED], error: null },
  };
});

describe('getAwaitingVerification', () => {
  it('returns both kinds and leaves resident reports in Approvals', async () => {
    const res = await getAwaitingVerification();
    expect(res.alertsError).toBeNull();
    expect(res.receiptsError).toBeNull();
    expect(res.alerts).toEqual([
      expect.objectContaining({ id: 'tx-1', amount: 5000, bank_account_last4: '1234', senderVerified: true }),
    ]);
    expect(res.receipts?.map((r) => r.id)).toEqual(['pay-1', 'pay-pending']);
    expect(res.receipts?.[0]).toMatchObject({ houseCode: 'A1', resident: 'Ada Obi' });
    expect(res.autoProcessLimit).toBe(60000);
  });

  it('asks for queued credits and unverified payments, with the explicit resident join', async () => {
    await getAwaitingVerification();
    expect(mocks.calls).toContainEqual(['email_transactions', 'eq', ['status', 'queued_for_review']]);
    expect(mocks.calls).toContainEqual(['email_transactions', 'eq', ['transaction_type', 'credit']]);
    expect(mocks.calls).toContainEqual(['payment_records', 'eq', ['is_verified', false]]);
    const cols = mocks.calls.find(([t, m]) => t === 'payment_records' && m === 'select')?.[2][0] as string;
    expect(cols).toContain('residents!payment_records_resident_id_fkey');
  });

  it('returns null alerts without email_imports.process and does not read them', async () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VERIFY];
    const res = await getAwaitingVerification();
    expect(res.alerts).toBeNull();
    expect(res.alertsError).toBe('no permission');
    expect(res.receipts).toHaveLength(2);
    expect(mocks.calls.some(([t]) => t === 'email_transactions')).toBe(false);
  });

  it('returns null receipts without payments.verify and does not read them', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_PROCESS];
    const res = await getAwaitingVerification();
    expect(res.receipts).toBeNull();
    expect(res.receiptsError).toBe('no permission');
    expect(res.alerts).toHaveLength(1);
    expect(mocks.calls.some(([t]) => t === 'payment_records')).toBe(false);
  });

  it('reports a failed half with its reason and keeps the other half', async () => {
    mocks.tables.payment_records = { data: null, error: { message: 'boom' } };
    const res = await getAwaitingVerification();
    expect(res.receipts).toBeNull();
    expect(res.receiptsError).toBe('boom');
    expect(res.alerts).toHaveLength(1);
  });
});
