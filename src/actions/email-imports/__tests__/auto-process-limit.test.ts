import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Email credits above the limit wait for an approver (#709). The limit is the
// email_import_auto_process_limit setting, N60,000 when absent (#710).

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; values: Record<string, unknown> }[],
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createPayment: vi.fn(),
  createExpense: vi.fn(),
  getGmailConnectionStatus: vi.fn(),
  runEmailFetch: vi.fn(),
  parseAllPendingEmails: vi.fn(),
  matchEmailTransactions: vi.fn(),
  getSettingResultAsService: vi.fn(),
  getSettingValue: vi.fn(),
}));

// A minimal email_transactions fake: selects filter `mocks.rows` by every
// eq/in, updates are recorded in `mocks.updates`.
function fakeClient() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | null = null;
      let single = false;
      const resolve = () => {
        if (table !== 'email_transactions') return { data: null, error: null };
        if (update) {
          mocks.updates.push({ id: filters.id, values: update });
          return { data: null, error: null };
        }
        const data = mocks.rows.filter((r) =>
          Object.entries(filters).every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v))
        );
        if (single) return { data: data[0] ?? null, error: data[0] ? null : { message: 'not found' } };
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: () => builder,
        ilike: () => builder,
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
        single: () => {
          single = true;
          return builder;
        },
        maybeSingle: () => {
          single = true;
          return builder;
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: async () => fakeClient(),
  createServerSupabaseClient: async () => fakeClient(),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: mocks.getSettingResultAsService }));
// The user-session reader returns null without a session (cron); it must not be used.
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: mocks.getSettingValue }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/actions/payments/create-payment', () => ({ createPayment: mocks.createPayment }));
vi.mock('@/actions/expenses/create-expense', () => ({ createExpense: mocks.createExpense }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/actions/email-imports/create-email-import', () => ({ updateEmailImportStatus: vi.fn() }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({
  checkDuplicateGuardrail: async () => ({ isDuplicate: false }),
}));
// Cron route dependencies; processEmailTransactions itself stays real.
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: () => null }));
vi.mock('@/lib/system-log/with-system-log', () => ({
  withSystemLog: (_name: string, _category: string, fn: (run: unknown) => unknown) =>
    fn({ summary: {}, outcome: 'success' }),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/actions/email-imports/gmail-oauth', () => ({
  getGmailConnectionStatus: mocks.getGmailConnectionStatus,
}));
vi.mock('@/lib/email-imports/fetch-emails', () => ({ runEmailFetch: mocks.runEmailFetch }));
vi.mock('@/lib/email-imports/parse-email', () => ({
  parseAllPendingEmails: mocks.parseAllPendingEmails,
}));
vi.mock('@/lib/email-imports/process-email-matching', () => ({
  matchEmailTransactions: mocks.matchEmailTransactions,
}));

import {
  processEmailTransactions,
  processSingleTransaction,
  skipTransaction,
} from '@/actions/email-imports/process-email-import';
import { GET } from '@/app/api/cron/fetch-emails/route';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  EMAIL_AUTO_PROCESS_LIMIT_KEY,
  EMAIL_AUTO_PROCESS_LIMIT_NGN,
  exceedsEmailAutoProcessLimit,
} from '@/lib/email-imports/utils';

const PROCESS_ONLY = [PERMISSIONS.EMAIL_IMPORTS_PROCESS];

function authAs(permissions: string[], roleName: string | null = 'finance_officer') {
  mocks.authorizePermission.mockResolvedValue({
    authorized: true,
    userId: 'user-1',
    roleName,
    roleId: 'role-1',
    permissions,
    error: null,
  });
}

function credit(id: string, amount: number, extra: Row = {}): Row {
  return {
    id,
    email_import_id: 'import-1',
    transaction_type: 'credit',
    status: 'matched',
    matched_resident_id: 'res-1',
    match_confidence: 'high',
    match_method: 'alias',
    amount,
    transaction_date: '2026-10-01',
    reference: `ref-${id}`,
    description: `Transfer ${id}`,
    ...extra,
  };
}

const updatesFor = (id: string) => mocks.updates.filter((u) => u.id === id).map((u) => u.values);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.updates = [];
  authAs(PROCESS_ONLY);
  mocks.createPayment.mockResolvedValue({ data: { id: 'pay-1' }, error: null });
  mocks.createExpense.mockResolvedValue({ data: { id: 'exp-1' }, error: null });
  mocks.getSettingResultAsService.mockResolvedValue({ status: 'absent' });
});

const limitSetTo = (value: unknown) =>
  mocks.getSettingResultAsService.mockResolvedValue({ status: 'ok', value });

describe('EMAIL_AUTO_PROCESS_LIMIT_NGN', () => {
  it('is N60,000 (naira, as email_transactions.amount stores it)', () => {
    expect(EMAIL_AUTO_PROCESS_LIMIT_NGN).toBe(60000);
  });
});

describe('processEmailTransactions auto-process limit', () => {
  it('auto-processes a high-confidence credit of exactly 60,000', async () => {
    mocks.rows = [credit('tx-at', 60000)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 60000, status: 'paid', resident_id: 'res-1' })
    );
    expect(result).toMatchObject({ autoProcessed: 1, queuedForReview: 0 });
    expect(updatesFor('tx-at')).toEqual([expect.objectContaining({ status: 'auto_processed' })]);
  });

  it('queues a high-confidence credit of 60,000.01 instead of creating a payment', async () => {
    mocks.rows = [credit('tx-over', 60000.01)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ autoProcessed: 0, queuedForReview: 1, errored: 0 });
    expect(updatesFor('tx-over')).toEqual([{ status: 'queued_for_review' }]);
  });

  it('still auto-processes an over-limit debit (expenses are not limited)', async () => {
    mocks.rows = [
      {
        id: 'tx-debit',
        email_import_id: 'import-1',
        transaction_type: 'debit',
        status: 'matched',
        matched_expense_category_id: 'cat-1',
        match_confidence: 'high',
        match_method: 'keyword',
        amount: 250000,
        transaction_date: '2026-10-01',
        description: 'Generator repair',
      },
    ];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 250000 }));
    expect(result).toMatchObject({ autoProcessed: 1, expensesCreated: 1, queuedForReview: 0 });
  });
});

describe('processEmailTransactions with the limit setting (#710)', () => {
  it('uses N60,000 when the row is absent', async () => {
    mocks.rows = [credit('tx-at', 60000), credit('tx-over', 60001)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.getSettingResultAsService).toHaveBeenCalledWith(EMAIL_AUTO_PROCESS_LIMIT_KEY);
    expect(result).toMatchObject({ autoProcessed: 1, queuedForReview: 1 });
    expect(updatesFor('tx-over')).toEqual([{ status: 'queued_for_review' }]);
  });

  it('a raised limit auto-processes a credit the default would queue', async () => {
    limitSetTo(100000);
    mocks.rows = [credit('tx-75k', 75000)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 75000 }));
    expect(result).toMatchObject({ autoProcessed: 1, queuedForReview: 0 });
  });

  it('a lowered limit queues a credit the default would auto-process', async () => {
    limitSetTo(10000);
    mocks.rows = [credit('tx-at', 10000), credit('tx-20k', 20000)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 10000 }));
    expect(updatesFor('tx-20k')).toEqual([{ status: 'queued_for_review' }]);
    expect(result).toMatchObject({ autoProcessed: 1, queuedForReview: 1 });
  });

  it('reads the setting once per run, not per transaction', async () => {
    mocks.rows = [credit('a', 100), credit('b', 200), credit('c', 300)];

    await processEmailTransactions('import-1');

    expect(mocks.getSettingResultAsService).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a read error: every credit is queued and the error is logged', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSettingResultAsService.mockResolvedValue({ status: 'error', message: 'db down' });
    mocks.rows = [credit('tx-small', 100), credit('tx-mid', 20000)];

    const result = await processEmailTransactions('import-1');

    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ autoProcessed: 0, queuedForReview: 2 });
    expect(updatesFor('tx-small')).toEqual([{ status: 'queued_for_review' }]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(EMAIL_AUTO_PROCESS_LIMIT_KEY),
      'db down'
    );
    consoleError.mockRestore();
  });

  it.each([0, -5, 1.5, 'abc', null, 1e12])(
    'fails closed on an invalid stored value (%s): every credit is queued',
    async (value) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      limitSetTo(value);
      mocks.rows = [credit('tx-small', 100)];

      const result = await processEmailTransactions('import-1');

      expect(mocks.createPayment).not.toHaveBeenCalled();
      expect(result).toMatchObject({ autoProcessed: 0, queuedForReview: 1 });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    }
  );

  it('still auto-processes debits when the read fails (expenses are not limited)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSettingResultAsService.mockResolvedValue({ status: 'error', message: 'db down' });
    mocks.rows = [
      {
        id: 'tx-debit',
        email_import_id: 'import-1',
        transaction_type: 'debit',
        status: 'matched',
        matched_expense_category_id: 'cat-1',
        match_confidence: 'high',
        match_method: 'keyword',
        amount: 250000,
        transaction_date: '2026-10-01',
        description: 'Generator repair',
      },
    ];

    expect(await processEmailTransactions('import-1')).toMatchObject({ autoProcessed: 1 });
  });
});

describe('exceedsEmailAutoProcessLimit', () => {
  it('treats an unknown (null) limit as every credit over it, but never a debit', () => {
    expect(exceedsEmailAutoProcessLimit({ transaction_type: 'credit', amount: 1 }, null)).toBe(true);
    expect(exceedsEmailAutoProcessLimit({ transaction_type: 'debit', amount: 1 }, null)).toBe(false);
  });
});

describe('cron fetch-emails route with an over-limit credit', () => {
  it('reports the over-limit credit under queuedForReview, not autoProcessed', async () => {
    mocks.rows = [credit('tx-small', 20000), credit('tx-big', 75000)];
    mocks.getGmailConnectionStatus.mockResolvedValue({ data: { connected: true, email: 'a@b.c' }, error: null });
    mocks.runEmailFetch.mockResolvedValue({
      success: true, importId: 'import-1', emailsFetched: 2, emailsSkipped: 0, emailsErrored: 0,
    });
    mocks.parseAllPendingEmails.mockResolvedValue({ messagesParsed: 2, transactionsExtracted: 2, errored: 0 });
    mocks.matchEmailTransactions.mockResolvedValue({ matched: 2, unmatched: 0 });

    const res = await GET({} as NextRequest);
    const body = await res.json();

    expect(body.processPhase).toEqual({ autoProcessed: 1, queuedForReview: 1, skipped: 0, errored: 0 });
    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 20000 }));
  });

  it('reads the limit through the service reader, never the user-session reader', async () => {
    limitSetTo(100000);
    mocks.rows = [credit('tx-big', 75000)];
    mocks.getGmailConnectionStatus.mockResolvedValue({ data: { connected: true, email: 'a@b.c' }, error: null });
    mocks.runEmailFetch.mockResolvedValue({
      success: true, importId: 'import-1', emailsFetched: 1, emailsSkipped: 0, emailsErrored: 0,
    });
    mocks.parseAllPendingEmails.mockResolvedValue({ messagesParsed: 1, transactionsExtracted: 1, errored: 0 });
    mocks.matchEmailTransactions.mockResolvedValue({ matched: 1, unmatched: 0 });

    const body = await (await GET({} as NextRequest)).json();

    expect(mocks.getSettingResultAsService).toHaveBeenCalledWith(EMAIL_AUTO_PROCESS_LIMIT_KEY);
    expect(mocks.getSettingValue).not.toHaveBeenCalled();
    expect(body.processPhase).toMatchObject({ autoProcessed: 1, queuedForReview: 0 });
  });
});

describe('processSingleTransaction release of an over-limit credit', () => {
  beforeEach(() => {
    mocks.rows = [credit('tx-over', 60001, { status: 'queued_for_review' })];
  });

  it('refuses an email_imports.process-only user with no write and no audit', async () => {
    const result = await processSingleTransaction('tx-over', { residentId: 'res-1' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Needs approval: payments over ₦60,000/);
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('allows a holder of imports.approve', async () => {
    authAs([...PROCESS_ONLY, PERMISSIONS.IMPORTS_APPROVE]);

    const result = await processSingleTransaction('tx-over', { residentId: 'res-1' });

    expect(result).toEqual({ success: true, paymentId: 'pay-1' });
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 60001 }));
    expect(updatesFor('tx-over')).toEqual([expect.objectContaining({ status: 'processed' })]);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
  });

  it('allows super_admin even without imports.approve', async () => {
    authAs(PROCESS_ONLY, 'super_admin');

    const result = await processSingleTransaction('tx-over', { residentId: 'res-1' });

    expect(result).toEqual({ success: true, paymentId: 'pay-1' });
    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
  });

  it('names the current limit, not a literal, in the refusal', async () => {
    limitSetTo(50000);

    const result = await processSingleTransaction('tx-over', { residentId: 'res-1' });

    expect(result.error).toMatch(/Needs approval: payments over ₦50,000/);
  });

  it('refuses a process-only user any credit when the limit cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getSettingResultAsService.mockResolvedValue({ status: 'error', message: 'db down' });
    mocks.rows = [credit('tx-small', 100, { status: 'queued_for_review' })];

    const result = await processSingleTransaction('tx-small', { residentId: 'res-1' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/approval limit could not be read/);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('lets an email_imports.process-only user skip it', async () => {
    const result = await skipTransaction('tx-over', 'not ours');

    expect(result).toEqual({ success: true });
    expect(updatesFor('tx-over')).toEqual([expect.objectContaining({ status: 'skipped' })]);
  });
});

describe('processSingleTransaction at or below the limit, and debits', () => {
  it('lets an email_imports.process-only user release a credit under a raised limit', async () => {
    limitSetTo(100000);
    mocks.rows = [credit('tx-75k', 75000, { status: 'queued_for_review' })];

    const result = await processSingleTransaction('tx-75k', { residentId: 'res-1' });

    expect(result).toEqual({ success: true, paymentId: 'pay-1' });
  });

  it('lets an email_imports.process-only user release a 60,000 credit', async () => {
    mocks.rows = [credit('tx-at', 60000, { status: 'queued_for_review' })];

    const result = await processSingleTransaction('tx-at', { residentId: 'res-1' });

    expect(result).toEqual({ success: true, paymentId: 'pay-1' });
    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
  });

  it('lets an email_imports.process-only user release an over-limit debit', async () => {
    mocks.rows = [
      {
        id: 'tx-debit',
        email_import_id: 'import-1',
        transaction_type: 'debit',
        status: 'queued_for_review',
        amount: 250000,
        transaction_date: '2026-10-01',
        description: 'Generator repair',
      },
    ];

    const result = await processSingleTransaction('tx-debit', { expenseCategoryId: 'cat-1' });

    expect(result).toEqual({ success: true, expenseId: 'exp-1' });
    expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 250000 }));
  });
});
