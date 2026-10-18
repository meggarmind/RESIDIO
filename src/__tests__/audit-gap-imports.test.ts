/**
 * Issue #556 item 8 -- import actions that were permission-guarded but never
 * audited: submitForApproval, matchImportRows, createImportRows. Each audits
 * only after its write succeeded; the bulk ones write ONE entry per call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, expectUuidEntityId, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { submitForApproval } from '@/actions/imports/process-import';
import { matchImportRows } from '@/actions/imports/match-residents';
import { createImportRows } from '@/actions/imports/create-import';
import { updateImportStatus } from '@/lib/imports/update-import-status';

const { authorizePermission, createServerSupabaseClient, logAudit, fetchAllRows, checkDuplicatesBatch, calls, results } =
  vi.hoisted(() => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    logAudit: vi.fn(),
    fetchAllRows: vi.fn(),
    checkDuplicatesBatch: vi.fn(),
    calls: [] as string[],
    results: {} as Record<string, QueryResult>,
  }));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/actions/reference/transaction-tags', () => ({
  autoTagTransaction: vi.fn(async () => ({ tag: null, matchedKeyword: null })),
}));
vi.mock('@/lib/matching', () => ({
  createMatcher: () => ({
    match: () => ({ resident_id: uid(9), confidence: 'high', method: 'exact', matched_value: 'x' }),
  }),
}));
vi.mock('@/actions/imports/process-import', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkDuplicatesBatch,
}));

const boom = { message: 'boom' };

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockImplementation(async () => {
    calls.push('audit');
  });
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls }));
  checkDuplicatesBatch.mockImplementation(async (rows: Array<{ id: string }>) => new Map(rows.map((r) => [r.id, { is_duplicate: false }])));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('submitForApproval audit (#556)', () => {
  beforeEach(() => {
    results['bank_statement_imports.select'] = { data: { id: uid(5), file_name: 'jan.csv', status: 'processing' } };
    // The status write is now conditional (#627): the update must report the row it changed.
    results['bank_statement_imports.update'] = { data: [{ id: uid(5) }] };
    // #666: submission requires at least one matched row.
    results['bank_statement_rows.select'] = { count: 2 };
  });

  it('audits the status change after the update', async () => {
    const res = await submitForApproval(uid(5));
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'bank_statement_imports',
        entityId: uid(5),
        newValues: { status: 'awaiting_approval' },
      })
    );
    expect(calls).toEqual(['write:bank_statement_imports.update', 'audit']);
  });

  it('does not audit when the update fails', async () => {
    results['bank_statement_imports.update'] = { error: boom };
    const res = await submitForApproval(uid(5));
    expect(res.error).toBe('boom');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the import is not in processing status', async () => {
    results['bank_statement_imports.select'] = { data: { id: uid(5), file_name: 'jan.csv', status: 'approved' } };
    await submitForApproval(uid(5));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('matchImportRows audit (#556)', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: uid(300 + i),
    description: 'Payment',
    amount: 100,
    reference: null,
    transaction_date: '2026-01-01',
    transaction_hash: null,
    transaction_type: 'credit',
  }));

  beforeEach(() => {
    // Rows can only be matched while the import is under review (#707).
    results['bank_statement_imports.select'] = { data: [{ id: uid(5), status: 'processing' }] };
  });

  it('writes ONE bounded entry for the whole run, after the writes', async () => {
    fetchAllRows.mockResolvedValue({ data: rows, error: null });
    const res = await matchImportRows(uid(5));
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'bank_statement_imports', entityId: uid(5) });
    expect(arg.newValues).toMatchObject({ total_count: 60, matched_count: 60, unmatched_count: 0 });
    expect(arg.newValues.row_ids).toHaveLength(50);
    expect(calls.at(-1)).toBe('audit');
    expect(calls.indexOf('audit')).toBeGreaterThan(calls.lastIndexOf('write:bank_statement_imports.update'));
  });

  it('does not audit when the rows cannot be loaded', async () => {
    fetchAllRows.mockResolvedValue({ data: null, error: 'load failed' });
    const res = await matchImportRows(uid(5));
    expect(res.error).toBe('load failed');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when there is nothing to match', async () => {
    fetchAllRows.mockResolvedValue({ data: [], error: null });
    await matchImportRows(uid(5));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('createImportRows audit (#556)', () => {
  const parsed = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      row_number: i + 1,
      raw_data: {},
      transaction_date: null,
      description: null,
      amount: null,
      transaction_type: null,
      reference: null,
    }));

  beforeEach(() => {
    results['bank_statement_imports.select'] = { data: { status: 'pending' } };
    // The status write is conditional (#627): the update must report the row it changed.
    results['bank_statement_imports.update'] = { data: [{ id: uid(5) }] };
  });

  it('writes ONE entry with the inserted count, after the inserts', async () => {
    const res = await createImportRows({ import_id: uid(5), rows: parsed(250) } as never);
    expect(res).toEqual({ count: 250, error: null });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'bank_statement_imports',
        entityId: uid(5),
        newValues: expect.objectContaining({ rows_created: 250 }),
      })
    );
    expect(calls.at(-1)).toBe('audit');
  });

  it('does not audit when an insert fails', async () => {
    results['bank_statement_rows.insert'] = { error: boom };
    const res = await createImportRows({ import_id: uid(5), rows: parsed(3) } as never);
    expect(res.count).toBe(0);
    expect(logAudit).not.toHaveBeenCalled();
  }, 15000);
});

describe('updateImportStatus audit (#541)', () => {
  beforeEach(() => {
    // processImport's claim (#707) is the only way in, so the helper only ever starts from posting.
    results['bank_statement_imports.select'] = { data: { status: 'posting' } };
    results['bank_statement_imports.update'] = { data: [{ id: uid(5), file_name: 'jan.csv' }] };
  });

  it('writes ONE entry after the update, with only the supplied fields', async () => {
    const res = await updateImportStatus({
      import_id: uid(5),
      status: 'failed',
      matched_rows: 3,
      import_summary: { big: 'payload' },
    });
    expect(res).toEqual({ error: null });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({
      action: 'UPDATE',
      entityType: 'bank_statement_imports',
      entityId: uid(5),
      entityDisplay: 'jan.csv',
      description: 'Import status set to failed',
    });
    expect(arg.newValues).toMatchObject({ status: 'failed', matched_rows: 3 });
    expect(arg.newValues).not.toHaveProperty('import_summary');
    expect(arg.newValues).not.toHaveProperty('created_rows');
    expect(calls).toEqual(['write:bank_statement_imports.update', 'audit']);
  });

  it('falls back to a short id when the row has no file name', async () => {
    results['bank_statement_imports.update'] = { data: [{ id: uid(5), file_name: null }] };
    await updateImportStatus({ import_id: uid(5), status: 'completed' });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0].entityDisplay).toBe(`Import ${uid(5).slice(0, 8)}`);
  });

  it('zero matched rows (lost race) is an error, writes no audit entry', async () => {
    results['bank_statement_imports.update'] = { data: [] };
    const res = await updateImportStatus({ import_id: uid(5), status: 'completed' });
    expect(res.error).toMatch(/changed concurrently/);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['posting', 'completed'],
    ['posting', 'failed'],
  ] as const)('includes a completed_at ISO timestamp for %s -> %s', async (from, status) => {
    results['bank_statement_imports.select'] = { data: { status: from } };
    await updateImportStatus({ import_id: uid(5), status });
    const { newValues } = logAudit.mock.calls[0][0];
    expect(typeof newValues.completed_at).toBe('string');
    expect(new Date(newValues.completed_at).toISOString()).toBe(newValues.completed_at);
  });

  // The old 'omits completed_at for a non-terminal status' case is dropped: every transition the
  // lib allows now ends in completed or failed, so no non-terminal target exists to test.

  it('does not audit and keeps the error when the update fails', async () => {
    results['bank_statement_imports.update'] = { error: boom };
    await expect(updateImportStatus({ import_id: uid(5), status: 'failed' })).resolves.toEqual({ error: 'boom' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the transition is rejected', async () => {
    const res = await updateImportStatus({ import_id: uid(5), status: 'awaiting_approval' });
    expect(res.error).toMatch(/Invalid import status transition/);
    expect(logAudit).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
