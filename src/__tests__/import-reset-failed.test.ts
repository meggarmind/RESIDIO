import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFailedImport } from '@/actions/imports/reset-import';
import { approveImport, processImport, submitForApproval } from '@/actions/imports/process-import';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #708: a failed import is reset to `processing` by a holder of imports.reset only. The
 * reset clears the submitter and approver so maker-checker runs again, never touches rows, and
 * is audited with the number of rows already created.
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

const IMPORT_ID = 'imp-1';
const RACE_ERROR = 'Import status changed, please refresh and try again';

// In-memory import row; updates apply only when every .eq() filter matches, like PostgREST.
let record: Record<string, unknown>;
let rowCounts: Record<string, number>;
let countError: { message: string } | null;
let currentUser: string;
let raceStatus: string | null;
let rowWrites: string[];
let countFilters: Array<Array<[string, unknown]>>;
let updateFilters: Array<Array<[string, unknown]>>;

beforeEach(() => {
  vi.clearAllMocks();
  record = {
    id: IMPORT_ID,
    file_name: 'jan.csv',
    status: 'failed',
    submitted_by: 'maker',
    submitted_at: '2026-10-01T00:00:00Z',
    approved_by: 'checker',
    approved_at: '2026-10-02T00:00:00Z',
  };
  rowCounts = { created: 4, matched: 6 };
  countError = null;
  currentUser = 'super';
  raceStatus = null;
  rowWrites = [];
  countFilters = [];
  updateFilters = [];
  authorizePermission.mockImplementation(async () => ({ authorized: true, userId: currentUser }));
  createServerSupabaseClient.mockImplementation(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUser } }, error: null }) },
    from(table: string) {
      let op = '';
      let vals: Record<string, unknown> = {};
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => {
        if (!op) op = 'select';
        return chain;
      };
      chain.update = (v: Record<string, unknown>) => {
        op = 'update';
        vals = v;
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
      chain.in = () => chain;
      chain.order = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      };
      const settle = () => {
        if (table === 'bank_statement_rows') {
          if (op !== 'select') {
            rowWrites.push(op);
            return { data: null, error: null };
          }
          countFilters.push(filters);
          const status = filters.find(([c]) => c === 'status')?.[1] as string;
          return { count: countError ? null : rowCounts[status] ?? 0, error: countError };
        }
        if (op === 'update') {
          updateFilters.push(filters);
          // Simulates another request moving the import between the read and the write
          if (raceStatus) record.status = raceStatus;
          const matches = filters.every(([c, v]) => record[c] === v);
          if (!matches) return { data: [], error: null };
          Object.assign(record, vals);
          return { data: [{ id: IMPORT_ID }], error: null };
        }
        return { data: { ...record }, error: null };
      };
      chain.single = async () => settle();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res);
      return chain;
    },
  }));
});

describe('resetFailedImport (#708)', () => {
  it('requires imports.reset and does nothing without it', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Nope' });
    const res = await resetFailedImport(IMPORT_ID);
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.IMPORTS_RESET);
    expect(res).toEqual({ createdRows: 0, error: 'Nope' });
    expect(record.status).toBe('failed');
    expect(updateFilters).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  for (const status of ['pending', 'processing', 'awaiting_approval', 'approved', 'completed', 'rejected']) {
    it(`refuses a ${status} import with no write and no audit`, async () => {
      record.status = status;
      const res = await resetFailedImport(IMPORT_ID);
      expect(res.error).toBe('Only a failed import can be reset');
      expect(record.status).toBe(status);
      expect(updateFilters).toEqual([]);
      expect(logAudit).not.toHaveBeenCalled();
    });
  }

  it('moves a failed import to processing and clears submitter, approver and timestamps', async () => {
    const res = await resetFailedImport(IMPORT_ID);
    expect(res).toEqual({ createdRows: 4, error: null });
    expect(record).toMatchObject({
      status: 'processing',
      submitted_by: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
    });
  });

  it('guards the write on failed so a race cannot reset another status', async () => {
    raceStatus = 'completed';
    const res = await resetFailedImport(IMPORT_ID);
    expect(updateFilters[0]).toEqual([
      ['id', IMPORT_ID],
      ['status', 'failed'],
    ]);
    expect(res.error).toBe(RACE_ERROR);
    expect(record.status).toBe('completed');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('never writes to bank_statement_rows, so created rows stay created', async () => {
    await resetFailedImport(IMPORT_ID);
    expect(rowWrites).toEqual([]);
  });

  it('counts only created rows of this import', async () => {
    await resetFailedImport(IMPORT_ID);
    expect(countFilters).toEqual([
      [
        ['import_id', IMPORT_ID],
        ['status', 'created'],
      ],
    ]);
  });

  it('returns a count error with no write', async () => {
    countError = { message: 'count exploded' };
    const res = await resetFailedImport(IMPORT_ID);
    expect(res.error).toBe('count exploded');
    expect(record.status).toBe('failed');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('audits once with old and new status and the created row count', async () => {
    await resetFailedImport(IMPORT_ID);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'bank_statement_imports',
        entityId: IMPORT_ID,
        oldValues: { status: 'failed' },
        newValues: { status: 'processing', rows_already_created: 4 },
      })
    );
  });

  it('a zero created count is reported as zero', async () => {
    rowCounts.created = 0;
    const res = await resetFailedImport(IMPORT_ID);
    expect(res.createdRows).toBe(0);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ newValues: { status: 'processing', rows_already_created: 0 } })
    );
  });
});

describe('maker-checker still applies after a reset (#708)', () => {
  it('the previous approver cannot approve or process the stale state', async () => {
    await resetFailedImport(IMPORT_ID);

    currentUser = 'checker';
    expect(await approveImport(IMPORT_ID)).toEqual({ error: 'Import is not awaiting approval' });
    const processed = await processImport({ import_id: IMPORT_ID });
    expect(processed.success).toBe(false);
    expect(processed.errors[0].error).toMatch(/Only approved imports can be processed/);
    expect(record.status).toBe('processing');
  });

  it('a fresh submit records the new submitter, who cannot approve it', async () => {
    await resetFailedImport(IMPORT_ID);

    currentUser = 'maker2';
    expect(await submitForApproval(IMPORT_ID)).toEqual({ error: null });
    expect(record).toMatchObject({ status: 'awaiting_approval', submitted_by: 'maker2' });

    expect(await approveImport(IMPORT_ID)).toEqual({
      error: 'You submitted this import, so a different approver is required',
    });

    currentUser = 'checker2';
    expect(await approveImport(IMPORT_ID)).toEqual({ error: null });
    expect(record).toMatchObject({ status: 'approved', approved_by: 'checker2' });
  });
});
