import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import { createImportRows } from '@/actions/imports/create-import';
import { approveImport, rejectImport, submitForApproval } from '@/actions/imports/process-import';

/**
 * Issue #627: approveImport / rejectImport / submitForApproval wrote the new status with no
 * status condition, so two racing requests could both pass the check and the loser overwrote
 * the winner. The write is now conditional on the checked status and a zero-row result is an error.
 */

const { authorizePermission, createServerSupabaseClient, logAudit, notifyAdmins } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows: vi.fn() }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins }));
vi.mock('@/actions/reference/transaction-tags', () => ({
  autoTagTransaction: vi.fn(async () => ({ tag: null, matchedKeyword: null })),
}));

const RACE_ERROR = 'Import status changed, please refresh and try again';

type Rec = {
  writes: string[];
  updates: Array<Record<string, unknown>>;
  eqs: Array<[string, unknown]>;
  selectsAfterUpdate: string[];
  countQueries: Array<{ cols: string; opts?: Record<string, unknown> }>;
  countEqs: Array<[string, unknown]>;
};
let rec: Rec;
let matchedCount: number | null;
let countError: { message: string } | null;
let currentStatus: string;
let updateRows: unknown[];
let updateError: { message: string } | null;

beforeEach(() => {
  vi.clearAllMocks();
  rec = { writes: [], updates: [], eqs: [], selectsAfterUpdate: [], countQueries: [], countEqs: [] };
  matchedCount = 3;
  countError = null;
  currentStatus = 'awaiting_approval';
  updateRows = [{ id: uid(1) }];
  updateError = null;
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockImplementation(async () => {
    rec.writes.push('audit');
  });
  notifyAdmins.mockImplementation(async () => {
    rec.writes.push('notify');
  });
  createServerSupabaseClient.mockImplementation(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      let op = '';
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string, opts?: Record<string, unknown>) => {
        if (op === 'update') rec.selectsAfterUpdate.push(cols);
        else if (!op) {
          op = 'select';
          // #666: the matched-row count query on bank_statement_rows
          if (table === 'bank_statement_rows') rec.countQueries.push({ cols, opts });
        }
        return chain;
      };
      chain.update = (vals: Record<string, unknown>) => {
        op = 'update';
        rec.updates.push(vals);
        return chain;
      };
      chain.insert = () => {
        op = 'insert';
        return chain;
      };
      chain.delete = () => {
        op = 'delete';
        return chain;
      };
      // createImportRows loads auto-tag rules (transaction_tags) with .order(); #649
      chain.order = () => chain;
      chain.in = () => chain;
      chain.eq = (col: string, val: unknown) => {
        if (op === 'update') rec.eqs.push([col, val]);
        if (op === 'select' && table === 'bank_statement_rows') rec.countEqs.push([col, val]);
        return chain;
      };
      const settle = () => {
        if (op === 'insert' || op === 'delete') {
          rec.writes.push(`write:${table}.${op}`);
          return { data: null, error: null };
        }
        if (op === 'update') {
          rec.writes.push(`write:${table}.update`);
          // Only the bank_statement_imports status write is under test; tag updates just succeed.
          if (table !== 'bank_statement_imports') return { data: null, error: null };
          return { data: updateRows, error: updateError };
        }
        if (table === 'bank_statement_rows') return { count: matchedCount, error: countError };
        return { data: { id: uid(1), file_name: 'jan.csv', status: currentStatus, import_summary: {} }, error: null };
      };
      chain.single = async () => settle();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res);
      return chain;
    },
  }));
});

const CASES = [
  {
    name: 'approveImport',
    run: () => approveImport(uid(1), 'ok'),
    from: 'awaiting_approval',
    to: 'approved',
    wrongError: 'Import is not awaiting approval',
    wrongStatuses: ['processing', 'approved', 'rejected', 'completed'],
    auditAction: 'APPROVE',
    after: [] as string[],
  },
  {
    name: 'rejectImport',
    run: () => rejectImport(uid(1), 'bad'),
    from: 'awaiting_approval',
    to: 'rejected',
    wrongError: 'Import is not awaiting approval',
    wrongStatuses: ['processing', 'approved', 'rejected', 'completed'],
    auditAction: 'REJECT',
    after: [] as string[],
  },
  {
    name: 'submitForApproval',
    run: () => submitForApproval(uid(1)),
    from: 'processing',
    to: 'awaiting_approval',
    wrongError: 'Import must be in processing status to submit for approval',
    wrongStatuses: ['pending', 'awaiting_approval', 'approved', 'completed'],
    auditAction: 'UPDATE',
    after: ['notify'],
  },
];

for (const c of CASES) {
  describe(`${c.name} status guard (#627)`, () => {
    beforeEach(() => {
      currentStatus = c.from;
    });

    it('happy path writes the new status and audits once', async () => {
      const res = await c.run();
      expect(res.error).toBeNull();
      expect(rec.updates).toHaveLength(1);
      expect(rec.updates[0]).toMatchObject({ status: c.to });
      expect(rec.writes).toEqual(['write:bank_statement_imports.update', 'audit', ...c.after]);
      expect(logAudit).toHaveBeenCalledTimes(1);
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: c.auditAction }));
    });

    it('conditions the update on the checked status and asks for the rows back', async () => {
      await c.run();
      expect(rec.eqs).toContainEqual(['id', uid(1)]);
      expect(rec.eqs).toContainEqual(['status', c.from]);
      expect(rec.selectsAfterUpdate).toEqual(['id']);
    });

    it('returns an error, no audit and no further writes when zero rows were updated', async () => {
      updateRows = [];
      const res = await c.run();
      expect(res.error).toBe(RACE_ERROR);
      expect(logAudit).not.toHaveBeenCalled();
      expect(notifyAdmins).not.toHaveBeenCalled();
      expect(rec.writes).toEqual(['write:bank_statement_imports.update']);
    });

    it('returns a database error unchanged, with no audit and no notification', async () => {
      updateError = { message: 'db exploded' };
      updateRows = [];
      const res = await c.run();
      expect(res.error).toBe('db exploded');
      expect(logAudit).not.toHaveBeenCalled();
      expect(notifyAdmins).not.toHaveBeenCalled();
      expect(rec.writes).toEqual(['write:bank_statement_imports.update']);
    });

    for (const status of c.wrongStatuses) {
      it(`still rejects current status ${status} with no write`, async () => {
        currentStatus = status;
        const res = await c.run();
        expect(res.error).toBe(c.wrongError);
        expect(rec.writes).toEqual([]);
        expect(logAudit).not.toHaveBeenCalled();
      });
    }
  });
}

describe('submitForApproval requires matched rows (#666)', () => {
  const NO_MATCHED = 'No matched rows to process, so there is nothing to submit.';

  beforeEach(() => {
    currentStatus = 'processing';
  });

  it('counts only matched rows of this import, head-only', async () => {
    await submitForApproval(uid(1));
    expect(rec.countQueries).toEqual([{ cols: 'id', opts: { count: 'exact', head: true } }]);
    expect(rec.countEqs).toEqual([
      ['import_id', uid(1)],
      ['status', 'matched'],
    ]);
  });

  it('refuses with zero matched rows: exact error, no write, no audit, no notification', async () => {
    matchedCount = 0;
    const res = await submitForApproval(uid(1));
    expect(res).toEqual({ error: NO_MATCHED });
    expect(rec.updates).toEqual([]);
    expect(rec.writes).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('treats a null count like zero', async () => {
    matchedCount = null;
    const res = await submitForApproval(uid(1));
    expect(res.error).toBe(NO_MATCHED);
    expect(rec.writes).toEqual([]);
  });

  it('submits with a single matched row', async () => {
    matchedCount = 1;
    const res = await submitForApproval(uid(1));
    expect(res.error).toBeNull();
    expect(rec.updates[0]).toMatchObject({ status: 'awaiting_approval' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('returns a count query error with no write', async () => {
    matchedCount = null;
    countError = { message: 'count exploded' };
    const res = await submitForApproval(uid(1));
    expect(res.error).toBe('count exploded');
    expect(rec.writes).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('keeps the status guard first: a wrong status never reaches the count', async () => {
    currentStatus = 'approved';
    matchedCount = 0;
    const res = await submitForApproval(uid(1));
    expect(res.error).toBe('Import must be in processing status to submit for approval');
    expect(rec.countQueries).toEqual([]);
  });

  it('keeps the permission check first: unauthorized never reaches the count', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Nope' });
    matchedCount = 0;
    const res = await submitForApproval(uid(1));
    expect(res.error).toBe('Nope');
    expect(rec.countQueries).toEqual([]);
  });
});

describe('createImportRows status guard (#627)', () => {
  const rows = [
    {
      row_number: 1,
      raw_data: {},
      transaction_date: new Date('2026-01-01'),
      description: 'x',
      amount: 10,
      transaction_type: 'credit',
      reference: null,
    },
  ] as unknown as Parameters<typeof createImportRows>[0]['rows'];

  beforeEach(() => {
    currentStatus = 'pending';
  });

  it('happy path inserts, moves pending -> processing and audits once', async () => {
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res.error).toBeNull();
    expect(res.count).toBe(1);
    expect(rec.writes).toEqual(['write:bank_statement_rows.insert', 'write:bank_statement_imports.update', 'audit']);
    expect(rec.updates[0]).toEqual({ status: 'processing' });
  });

  it('conditions the status update on pending and asks for the rows back', async () => {
    await createImportRows({ import_id: uid(1), rows });
    expect(rec.eqs).toContainEqual(['id', uid(1)]);
    expect(rec.eqs).toContainEqual(['status', 'pending']);
    expect(rec.selectsAfterUpdate).toEqual(['id']);
  });

  it('zero rows updated: error, count 0, inserted rows rolled back, no audit', async () => {
    updateRows = [];
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res).toEqual({ count: 0, error: RACE_ERROR });
    expect(rec.writes).toEqual([
      'write:bank_statement_rows.insert',
      'write:bank_statement_imports.update',
      'write:bank_statement_rows.delete',
    ]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('database error on the status write: error returned, rows rolled back, no audit', async () => {
    updateError = { message: 'db exploded' };
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res).toEqual({ count: 0, error: 'db exploded' });
    expect(rec.writes).toContain('write:bank_statement_rows.delete');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('still rejects a non-pending import with no write', async () => {
    currentStatus = 'processing';
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res.error).toMatch(/Cannot add rows to an import with status: processing/);
    expect(rec.writes).toEqual([]);
  });
});
