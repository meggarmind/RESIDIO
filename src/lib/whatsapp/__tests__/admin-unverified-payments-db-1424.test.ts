import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPaymentAsAdmin: vi.fn(),
  recordAudit: vi.fn(),
  loadLiveReviewer: vi.fn(),
  results: {} as Record<string, unknown>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

vi.mock('@/lib/payments/create-payment', () => ({ createPaymentAsAdmin: mocks.createPaymentAsAdmin }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/lib/approvals/decision', () => ({ loadLiveReviewer: mocks.loadLiveReviewer }));
vi.mock('@/lib/email-imports/auto-record', () => ({ readEmailAutoProcessLimit: vi.fn() }));

/** Chainable query double per table that records each call; awaiting it or maybeSingle() gives the table's result. */
function query(table: string) {
  const result = mocks.results[table] ?? { data: null, error: null };
  const promise = Promise.resolve(result);
  const q: Record<string, unknown> = { then: promise.then.bind(promise) };
  for (const method of ['select', 'eq', 'in', 'or', 'ilike', 'order', 'limit', 'update', 'insert']) {
    q[method] = vi.fn((...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return q;
    });
  }
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  return q;
}
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => query(table) }) }));

import { createUnverifiedPaymentsRepository, type UnverifiedAlert } from '@/lib/whatsapp/admin-unverified-payments-db';

const repo = createUnverifiedPaymentsRepository();
const calls = (table: string, method: string) => mocks.calls.filter((c) => c.table === table && c.method === method).map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  mocks.results = {};
});

const ALERT: UnverifiedAlert = {
  id: 'alert-1',
  amount: 65000,
  date: '2026-11-02',
  createdAt: '2026-11-02T08:00:00Z',
  description: 'NIP/HENRY ITOKI',
  reference: 'REF-1',
  emailImportId: 'import-1',
  transactionDate: '2026-11-02T08:00:00Z',
  senderVerified: true,
};

describe('Unverified payments database (#1424)', () => {
  it('records the payment verified, on the house, with the admin as actor and channel whatsapp_admin', async () => {
    mocks.createPaymentAsAdmin.mockResolvedValue({ success: true, data: { id: 'pay-1' } });
    const result = await repo.recordPayment(ALERT, { houseId: 'house-1', residentId: 'res-1' }, 'chair-1', true);
    expect(result).toEqual({ paymentId: 'pay-1' });
    expect(mocks.createPaymentAsAdmin).toHaveBeenCalledTimes(1);
    const [data, profileId, metadata] = mocks.createPaymentAsAdmin.mock.calls[0];
    expect(data).toEqual(
      expect.objectContaining({
        resident_id: 'res-1',
        house_id: 'house-1',
        amount: 65000,
        method: 'bank_transfer',
        reference_number: 'REF-1',
        email_import_id: 'import-1',
        email_transaction_id: 'alert-1',
        paid_by_resident_id: 'res-1',
        is_verified: true,
      })
    );
    expect(profileId).toBe('chair-1');
    expect(metadata).toEqual({ channel: 'whatsapp_admin' });
  });

  it('records the payment unverified when the alert is not bank proof (#1428)', async () => {
    mocks.createPaymentAsAdmin.mockResolvedValue({ success: true, data: { id: 'pay-2' } });
    expect(await repo.recordPayment({ ...ALERT, senderVerified: false }, { houseId: 'house-1', residentId: 'res-1' }, 'chair-1', false)).toEqual({ paymentId: 'pay-2' });
    expect(mocks.createPaymentAsAdmin.mock.calls[0][0]).toEqual(expect.objectContaining({ is_verified: false }));
  });

  it('loads the sender check of the alert email with the alert (#1428)', async () => {
    const row = { ...ALERT, amount: 65000, transaction_date: '2026-11-02T08:00:00Z', created_at: 'c', email_import_id: 'i' };
    mocks.results.email_transactions = {
      data: [
        { ...row, id: 'a-yes', email_messages: { sender_verified: true } },
        { ...row, id: 'a-no', email_messages: { sender_verified: false } },
        { ...row, id: 'a-null', email_messages: { sender_verified: null } },
        { ...row, id: 'a-none', email_messages: null },
        { ...row, id: 'a-array', email_messages: [{ sender_verified: true }] },
      ],
      error: null,
    };
    expect((await repo.listAlerts()).map((a) => [a.id, a.senderVerified])).toEqual([
      ['a-yes', true],
      ['a-no', false],
      ['a-null', false],
      ['a-none', false],
      ['a-array', true],
    ]);
    expect(String(calls('email_transactions', 'select')[0][0])).toContain('email_messages(sender_verified)');
  });

  it('passes a refused payment on as an error', async () => {
    mocks.createPaymentAsAdmin.mockResolvedValue({ error: 'Duplicate Payment Detected: x' });
    expect(await repo.recordPayment(ALERT, { houseId: 'house-1', residentId: 'res-1' }, 'chair-1', true)).toEqual({ error: 'Duplicate Payment Detected: x' });
  });

  it('lists queued credits only, and leaves resident reports waiting in Approvals out of the payments', async () => {
    mocks.results.email_transactions = { data: [{ ...ALERT, amount: '65000', transaction_date: '2026-11-01T23:30:00Z', created_at: 'c', email_import_id: 'i' }], error: null };
    const [listed] = await repo.listAlerts();
    expect(listed.date).toBe('2026-11-02'); // the Lagos day
    expect(listed.amount).toBe(65000);
    expect(calls('email_transactions', 'eq')).toEqual([['status', 'queued_for_review'], ['transaction_type', 'credit']]);

    mocks.results.payment_records = {
      data: [
        { id: 'p-1', amount: 5000, payment_date: '2026-10-01', status: 'paid', approval_request_id: null, resident_id: 'r', house: { short_name: 'A-1' }, resident: { first_name: 'ADA', last_name: 'OBI' } },
        { id: 'p-2', amount: 5000, payment_date: '2026-10-01', status: 'pending', approval_request_id: 'req-1', resident_id: 'r', house: null, resident: null },
      ],
      error: null,
    };
    expect((await repo.listPayments()).map((p) => [p.id, p.houseCode, p.resident])).toEqual([['p-1', 'A-1', 'ADA OBI']]);
    expect(calls('payment_records', 'eq')).toEqual([['is_verified', false]]);
    // payment_records has two foreign keys to residents: the join names one.
    expect(String(calls('payment_records', 'select')[0][0])).toContain('residents!payment_records_resident_id_fkey');
  });

  it('gives no payment for a resident report waiting in Approvals, and the payment otherwise', async () => {
    const row = { id: 'p-2', amount: 5000, payment_date: '2026-10-01', resident_id: 'r', house: null, resident: null };
    mocks.results.payment_records = { data: { ...row, status: 'pending', approval_request_id: 'req-1' }, error: null };
    expect(await repo.getPayment('p-2')).toBeNull();
    mocks.results.payment_records = { data: { ...row, status: 'pending', approval_request_id: null }, error: null };
    expect(await repo.getPayment('p-2')).toEqual(expect.objectContaining({ id: 'p-2' }));
    expect(calls('payment_records', 'eq').slice(0, 2)).toEqual([['id', 'p-2'], ['is_verified', false]]);
  });

  it('finds the payment recorded from an alert by its email transaction', async () => {
    mocks.results.payment_records = { data: { id: 'pay-9' }, error: null };
    expect(await repo.paymentForAlert('alert-1')).toBe('pay-9');
    expect(calls('payment_records', 'eq')).toEqual([['email_transaction_id', 'alert-1']]);
    mocks.results.payment_records = { data: null, error: null };
    expect(await repo.paymentForAlert('alert-1')).toBeNull();
  });

  it('verifies a payment only while it is unverified and not a resident report', async () => {
    mocks.results.payment_records = { data: [], error: null };
    expect(await repo.verifyPayment('p-1', { profileId: 'chair-1', notes: 'n', emailTransactionId: 'alert-1' })).toBe(false);
    const [update] = calls('payment_records', 'update')[0] as [Record<string, unknown>];
    expect(update).toEqual(expect.objectContaining({ is_verified: true, verified_by: 'chair-1', notes: 'n', email_transaction_id: 'alert-1' }));
    expect(calls('payment_records', 'eq')).toEqual([['id', 'p-1'], ['is_verified', false]]);
    expect(calls('payment_records', 'or')).toEqual([['status.neq.pending,approval_request_id.is.null']]);

    mocks.results.payment_records = { data: [{ id: 'p-1' }], error: null };
    expect(await repo.verifyPayment('p-1', { profileId: 'chair-1', notes: null })).toBe(true);
  });

  it('claims and skips an alert only while it waits for review', async () => {
    mocks.results.email_transactions = { data: [], error: null };
    expect(await repo.claimAlert('alert-1')).toBe(false);
    expect(await repo.skipAlert('alert-1', 'Not estate money (WhatsApp admin)', 'chair-1')).toBe(false);
    expect(calls('email_transactions', 'eq').filter(([column]) => column === 'status')).toEqual([
      ['status', 'queued_for_review'],
      ['status', 'queued_for_review'],
    ]);
    expect(calls('email_transactions', 'update')[1][0]).toEqual(expect.objectContaining({ status: 'skipped', skip_reason: 'Not estate money (WhatsApp admin)', reviewed_by: 'chair-1' }));
  });

  it('picks the tenant before a landlord as the house resident', async () => {
    mocks.results.houses = { data: { id: 'house-1', short_name: 'IBB-3AF-4' }, error: null };
    mocks.results.resident_houses = {
      data: [
        { resident_id: 'landlord', resident_role: 'non_resident_landlord', resident: { first_name: 'LAND', last_name: 'LORD' } },
        { resident_id: 'tenant', resident_role: 'tenant', resident: { first_name: 'TEN', last_name: 'ANT' } },
      ],
      error: null,
    };
    expect(await repo.findHouse('ibb-3af-4')).toEqual({ houseId: 'house-1', code: 'IBB-3AF-4', residentId: 'tenant', resident: 'TEN ANT' });
  });

  it('searches names and payer names on active houses, escaping % and _, naming the resident_houses foreign keys (#1433)', async () => {
    mocks.results.residents = { data: [{ id: 'r-1' }, { id: 'r-2' }], error: null };
    mocks.results.resident_payment_aliases = { data: [{ resident_id: 'r-3' }], error: null };
    const link = (resident_id: string, house_id: string, code: string, role: string, first: string, last: string, status = 'active', active = true) => ({
      resident_id,
      house_id,
      resident_role: role,
      house: { short_name: code, is_active: active },
      resident: [{ first_name: first, last_name: last, account_status: status }],
    });
    mocks.results.resident_houses = {
      data: [
        link('r-1', 'h-2', 'KOA-15F-2', 'tenant', 'Martins', 'Awonusi'),
        link('r-1', 'h-1', 'KOA-1', 'resident_landlord', 'Martins', 'Awonusi'),
        link('r-2', 'h-3', 'OJO-1', 'tenant', 'Ada', 'Eze'), // name does not have the word: not a hit
        link('r-3', 'h-4', 'IBB-1', 'co_resident', 'Ada', 'Eze'), // saved payer name: a hit
        link('r-1', 'h-5', 'OFF-1', 'tenant', 'Martins', 'Awonusi', 'inactive'),
        link('r-1', 'h-6', 'OLD-1', 'tenant', 'Martins', 'Awonusi', 'active', false),
      ],
      error: null,
    };
    const found = await repo.searchHouses('martins');
    expect(found.map((f) => `${f.code} ${f.resident} ${f.role}`)).toEqual([
      'IBB-1 Ada Eze co_resident',
      'KOA-1 Martins Awonusi resident_landlord',
      'KOA-15F-2 Martins Awonusi tenant',
    ]);
    expect(found[0]).toEqual({ houseId: 'h-4', code: 'IBB-1', residentId: 'r-3', resident: 'Ada Eze', role: 'co_resident' });
    const select = calls('resident_houses', 'select')[0][0] as string;
    expect(select).toContain('houses!resident_houses_house_id_fkey');
    expect(select).toContain('residents!resident_houses_resident_id_fkey');
    expect(calls('resident_houses', 'eq')).toContainEqual(['is_active', true]);
    expect(calls('resident_houses', 'in')).toContainEqual(['resident_id', ['r-1', 'r-2', 'r-3']]);
    expect(calls('resident_houses', 'in')).toContainEqual(['resident_role', ['tenant', 'resident_landlord', 'non_resident_landlord', 'co_resident']]);

    mocks.calls = [];
    await repo.searchHouses('50%_xy');
    expect(calls('residents', 'or')[0][0]).toBe('first_name.ilike.%50\\%\\_xy%,last_name.ilike.%50\\%\\_xy%');
    expect(calls('resident_payment_aliases', 'ilike')[0]).toEqual(['alias_name', '%50\\%\\_xy%']);
    expect(calls('resident_payment_aliases', 'eq')).toContainEqual(['is_active', true]);
  });

  it('does not search for fewer than 2 letters (#1433)', async () => {
    expect(await repo.searchHouses(' a ')).toEqual([]);
    expect(await repo.searchHouses('1')).toEqual([]);
    expect(mocks.calls).toEqual([]);
  });

  it('writes each audit entry with the admin as actor and channel whatsapp_admin', async () => {
    await repo.audit({ action: 'REJECT', entityType: 'email_transactions', entityId: 'alert-1', metadata: { x: 1 } }, 'chair-1');
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      { action: 'REJECT', entityType: 'email_transactions', entityId: 'alert-1', metadata: { x: 1, channel: 'whatsapp_admin' } },
      { userId: 'chair-1' }
    );
  });

  it('reads the live permissions from the account, not the session', async () => {
    mocks.loadLiveReviewer.mockResolvedValue({ permissions: ['payments.verify'], residentId: null });
    expect(await repo.livePermissions('chair-1')).toEqual(['payments.verify']);
    expect(mocks.loadLiveReviewer).toHaveBeenCalledWith('chair-1');
  });
});
