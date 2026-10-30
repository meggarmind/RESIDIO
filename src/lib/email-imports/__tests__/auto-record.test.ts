import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1340: the scheduled run records a matched bank-alert credit as a payment with no admin step,
 * only when every guard holds. Everything else is left open for the review queue.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; values: Record<string, unknown> }[],
  accounts: [{ account_number: '0123451234' }] as Record<string, unknown>[],
  selectError: null as { message: string } | null,
  getSettingResultAsService: vi.fn(),
  checkDuplicateGuardrail: vi.fn(),
  createPaymentAsSystem: vi.fn(),
  notifyAdmins: vi.fn(),
}));

// email_transactions fake: selects filter `mocks.rows` by every eq/in; an update applies to the
// matching rows, is recorded in `mocks.updates`, and returns those rows (the claim reads them).
function fakeClient() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null;
      const resolve = () => {
        if (table === 'estate_bank_accounts') return { data: mocks.accounts, error: null };
        if (table !== 'email_transactions') return { data: null, error: null };
        const matching = mocks.rows.filter((r) =>
          Object.entries(filters).every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v))
        );
        if (update) {
          mocks.updates.push({ id: filters.id, values: update });
          for (const r of matching) Object.assign(r, update);
          return { data: matching.map((r) => ({ id: r.id })), error: null };
        }
        return { data: matching, error: mocks.selectError };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          update = values;
          return builder;
        },
        eq: (c: string, v: unknown) => {
          filters[c] = v;
          return builder;
        },
        in: (c: string, v: unknown) => {
          filters[c] = v;
          return builder;
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

const client = fakeClient();
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: async () => client }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: mocks.getSettingResultAsService }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({ checkDuplicateGuardrail: mocks.checkDuplicateGuardrail }));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentAsSystem: mocks.createPaymentAsSystem }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: mocks.notifyAdmins }));

import { autoRecordEmailPayments, AUTO_RECORD_SOURCE } from '@/lib/email-imports/auto-record';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const IMPORT_ID = 'import-1';
let paymentSeq = 0;

function credit(id: string, amount: number, extra: Row = {}): Row {
  return {
    id,
    email_import_id: IMPORT_ID,
    transaction_type: 'credit',
    status: 'matched',
    matched_resident_id: 'res-1',
    match_confidence: 'high',
    match_method: 'alias',
    amount,
    bank_account_last4: '1234',
    transaction_date: '2026-10-01',
    reference: `ref-${id}`,
    description: `Transfer ${id}`,
    email_messages: { email_type: 'transaction_alert', sender_verified: true, sender_check: 'dkim=pass header.d=firstbanknigeria.com' },
    residents: { first_name: 'Ada', last_name: 'Obi' },
    ...extra,
  };
}

const updatesFor = (id: string) => mocks.updates.filter((u) => u.id === id).map((u) => u.values);
const limitSetTo = (value: unknown) => mocks.getSettingResultAsService.mockResolvedValue({ status: 'ok', value });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.updates = [];
  mocks.selectError = null;
  paymentSeq = 0;
  mocks.getSettingResultAsService.mockResolvedValue({ status: 'absent' }); // default N60,000
  mocks.checkDuplicateGuardrail.mockResolvedValue({ isDuplicate: false });
  mocks.createPaymentAsSystem.mockImplementation(async () => ({ success: true, data: { id: `pay-${++paymentSeq}` } }));
});

describe('autoRecordEmailPayments estate account guard (#1340)', () => {
  it.each([
    ['another account', '9999'],
    ['an unparsed account', null],
  ])('leaves a credit to %s open for review, with no payment', async (_name, last4) => {
    mocks.rows = [credit('tx-acct', 1000, { bank_account_last4: last4 })];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result.autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(updatesFor('tx-acct')).toEqual([{ review_reason: 'Credited account is not an estate account' }]);
  });
});

describe('autoRecordEmailPayments limit edge (#1340)', () => {
  it('records a credit equal to the limit as a verified payment through the session-free core', async () => {
    mocks.rows = [credit('tx-at', 60000)];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result.autoRecorded).toEqual([
      { transactionId: 'tx-at', paymentId: 'pay-1', amount: 60000, residentName: 'Ada Obi', reference: 'ref-tx-at' },
    ]);
    expect(mocks.createPaymentAsSystem).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentAsSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        resident_id: 'res-1',
        amount: 60000,
        method: 'bank_transfer',
        reference_number: 'ref-tx-at',
        email_import_id: IMPORT_ID,
        email_transaction_id: 'tx-at',
        is_verified: true,
      }),
      AUTO_RECORD_SOURCE
    );
    expect(AUTO_RECORD_SOURCE).toBe('cron:fetch-emails');
    expect(updatesFor('tx-at')).toEqual([
      expect.objectContaining({ status: 'auto_processed' }),
      { payment_id: 'pay-1' },
    ]);
  });

  it('leaves a credit one naira over the limit open for review, with no payment', async () => {
    mocks.rows = [credit('tx-over', 60001)];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result.autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
    expect(mocks.rows[0].status).toBe('matched');
  });
});

describe('autoRecordEmailPayments uses the live limit setting (#1340)', () => {
  it('a raised limit records what the default would queue, with no deploy', async () => {
    limitSetTo(75000);
    mocks.rows = [credit('tx-75k', 75000)];
    expect((await autoRecordEmailPayments(IMPORT_ID)).autoRecorded).toHaveLength(1);
  });

  it('a lowered limit queues what the default would record', async () => {
    limitSetTo(10000);
    mocks.rows = [credit('tx-10k', 10000), credit('tx-20k', 20000)];
    const result = await autoRecordEmailPayments(IMPORT_ID);
    expect(result.autoRecorded.map((p) => p.transactionId)).toEqual(['tx-10k']);
  });

  it('fails closed when the setting cannot be read: nothing is recorded', async () => {
    mocks.getSettingResultAsService.mockResolvedValue({ status: 'error', message: 'db down' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rows = [credit('tx-small', 100)];
    expect((await autoRecordEmailPayments(IMPORT_ID)).autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
  });
});

describe('autoRecordEmailPayments match and source guards (#1340)', () => {
  it.each([
    ['medium confidence', { match_confidence: 'medium' }],
    ['a name match', { match_method: 'name' }],
    ['a keyword match', { match_method: 'keyword' }],
    ['no matched resident', { matched_resident_id: null }],
    ['a zero amount', { amount: 0 }],
    ['a statement row', { email_messages: { email_type: 'statement_attachment', sender_verified: true, sender_check: 'ok' } }],
    ['no message', { email_messages: null }],
  ])('leaves %s open for review, with no payment', async (_label, extra) => {
    mocks.rows = [credit('tx-1', 5000, extra)];
    const result = await autoRecordEmailPayments(IMPORT_ID);
    expect(result.autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
  });

  it('records a high-confidence phone match too', async () => {
    mocks.rows = [credit('tx-phone', 5000, { match_method: 'phone' })];
    expect((await autoRecordEmailPayments(IMPORT_ID)).autoRecorded).toHaveLength(1);
  });

  it('never picks a debit (debits stay queued)', async () => {
    mocks.rows = [credit('tx-debit', 5000, { transaction_type: 'debit' })];
    await autoRecordEmailPayments(IMPORT_ID);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
  });

  it.each([
    ['failed', false, 'No Authentication-Results header', 'Sender check failed: No Authentication-Results header'],
    ['never ran', null, null, 'Sender check failed: not checked'],
  ])('queues a credit whose sender check %s, with the reason, and no payment', async (_l, verified, check, reason) => {
    mocks.rows = [credit('tx-forged', 5000, {
      email_messages: { email_type: 'transaction_alert', sender_verified: verified, sender_check: check },
    })];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result).toMatchObject({ autoRecorded: [], senderRejected: 1 });
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(updatesFor('tx-forged')).toEqual([{ review_reason: reason }]);
    expect(mocks.rows[0].status).toBe('matched'); // the queue step still picks it up
  });
});

describe('autoRecordEmailPayments duplicates (#1340)', () => {
  it('skips a duplicate payment instead of recording it', async () => {
    mocks.checkDuplicateGuardrail.mockResolvedValue({ isDuplicate: true, reason: 'Duplicate reference number' });
    mocks.rows = [credit('tx-dup', 5000)];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result).toMatchObject({ autoRecorded: [], skipped: 1 });
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(updatesFor('tx-dup')).toEqual([{ status: 'skipped', skip_reason: 'Duplicate payment detected' }]);
    expect(mocks.checkDuplicateGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, residentId: 'res-1', reference: 'ref-tx-dup' }),
      'payment',
      expect.objectContaining({ client })
    );
  });

  it('a repeat run over the same import creates no second payment', async () => {
    mocks.rows = [credit('tx-1', 5000)];

    await autoRecordEmailPayments(IMPORT_ID);
    const second = await autoRecordEmailPayments(IMPORT_ID);

    expect(second.autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).toHaveBeenCalledTimes(1);
  });

  it('does not record a row another run claimed first', async () => {
    mocks.rows = [credit('tx-1', 5000)];
    // An overlapping run claims the row between this run's read and its claim.
    mocks.checkDuplicateGuardrail.mockImplementation(async () => {
      mocks.rows[0].status = 'auto_processed';
      return { isDuplicate: false };
    });

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result.autoRecorded).toEqual([]);
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
  });

  it('marks the row as an error, not recorded, when the duplicate check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.checkDuplicateGuardrail.mockRejectedValue(new Error('Duplicate check failed: timeout'));
    mocks.rows = [credit('tx-1', 5000)];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result).toMatchObject({ autoRecorded: [], errored: 1 });
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
    expect(updatesFor('tx-1')).toEqual([{ status: 'error', error_message: 'Duplicate check failed: timeout' }]);
  });
});

describe('autoRecordEmailPayments results and notice (#1340)', () => {
  it('marks the row as an error when the payment is refused', async () => {
    mocks.createPaymentAsSystem.mockResolvedValue({ error: 'Duplicate Payment Detected: x' });
    mocks.rows = [credit('tx-1', 5000)];

    const result = await autoRecordEmailPayments(IMPORT_ID);

    expect(result).toMatchObject({ autoRecorded: [], errored: 1 });
    expect(updatesFor('tx-1')).toEqual([
      expect.objectContaining({ status: 'auto_processed' }),
      { status: 'error', error_message: 'Duplicate Payment Detected: x' },
    ]);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it('sends one summary per run listing each recorded payment', async () => {
    mocks.rows = [credit('tx-1', 5000), credit('tx-2', 12500, { reference: null }), credit('tx-big', 90000)];

    await autoRecordEmailPayments(IMPORT_ID);

    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(1);
    const notice = mocks.notifyAdmins.mock.calls[0][0];
    expect(notice).toMatchObject({
      title: 'Bank Alert Payments Recorded',
      actionUrl: `/payments/email-imports/${IMPORT_ID}`,
      requiredPermission: PERMISSIONS.PAYMENTS_VIEW,
    });
    expect(notice.body).toContain('2 payments');
    expect(notice.body).toContain('₦5,000 from Ada Obi (ref-tx-1)');
    expect(notice.body).toContain('₦12,500 from Ada Obi');
    expect(notice.body).not.toContain('90,000');
  });

  it('notifies nobody when nothing was recorded', async () => {
    mocks.rows = [credit('tx-big', 90000)];
    await autoRecordEmailPayments(IMPORT_ID);
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
  });

  it('returns the error and records nothing when the transactions cannot be read', async () => {
    mocks.selectError = { message: 'select failed' };
    mocks.rows = [credit('tx-1', 5000)];
    expect(await autoRecordEmailPayments(IMPORT_ID)).toMatchObject({ autoRecorded: [], error: 'select failed' });
    expect(mocks.createPaymentAsSystem).not.toHaveBeenCalled();
  });
});
