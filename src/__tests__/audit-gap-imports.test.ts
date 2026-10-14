/**
 * Issue #556 item 8 -- import actions that were permission-guarded but never
 * audited: submitForApproval, matchImportRows, createImportRows. Each audits
 * only after its write succeeded; the bulk ones write ONE entry per call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { submitForApproval } from '@/actions/imports/process-import';
import { matchImportRows } from '@/actions/imports/match-residents';
import { createImportRows } from '@/actions/imports/create-import';

const { authorizePermission, createServerSupabaseClient, logAudit, fetchAllRows, checkDuplicate, calls, results } =
  vi.hoisted(() => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    logAudit: vi.fn(),
    fetchAllRows: vi.fn(),
    checkDuplicate: vi.fn(),
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
    match: () => ({ resident_id: 'res-1', confidence: 'high', method: 'exact', matched_value: 'x' }),
  }),
}));
vi.mock('@/actions/imports/process-import', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkDuplicate,
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
  checkDuplicate.mockResolvedValue({ is_duplicate: false });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('submitForApproval audit (#556)', () => {
  beforeEach(() => {
    results['bank_statement_imports.select'] = { data: { id: 'imp-1', file_name: 'jan.csv', status: 'processing' } };
  });

  it('audits the status change after the update', async () => {
    const res = await submitForApproval('imp-1');
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'bank_statement_imports',
        entityId: 'imp-1',
        newValues: { status: 'awaiting_approval' },
      })
    );
    expect(calls).toEqual(['write:bank_statement_imports.update', 'audit']);
  });

  it('does not audit when the update fails', async () => {
    results['bank_statement_imports.update'] = { error: boom };
    const res = await submitForApproval('imp-1');
    expect(res.error).toBe('boom');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the import is not in processing status', async () => {
    results['bank_statement_imports.select'] = { data: { id: 'imp-1', file_name: 'jan.csv', status: 'approved' } };
    await submitForApproval('imp-1');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('matchImportRows audit (#556)', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: `row-${i}`,
    description: 'Payment',
    amount: 100,
    reference: null,
    transaction_date: '2026-01-01',
    transaction_hash: null,
    transaction_type: 'credit',
  }));

  it('writes ONE bounded entry for the whole run, after the writes', async () => {
    fetchAllRows.mockResolvedValue({ data: rows, error: null });
    const res = await matchImportRows('imp-1');
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'bank_statement_imports', entityId: 'imp-1' });
    expect(arg.newValues).toMatchObject({ total_count: 60, matched_count: 60, unmatched_count: 0 });
    expect(arg.newValues.row_ids).toHaveLength(50);
    expect(calls.at(-1)).toBe('audit');
    expect(calls.indexOf('audit')).toBeGreaterThan(calls.lastIndexOf('write:bank_statement_imports.update'));
  });

  it('does not audit when the rows cannot be loaded', async () => {
    fetchAllRows.mockResolvedValue({ data: null, error: 'load failed' });
    const res = await matchImportRows('imp-1');
    expect(res.error).toBe('load failed');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when there is nothing to match', async () => {
    fetchAllRows.mockResolvedValue({ data: [], error: null });
    await matchImportRows('imp-1');
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

  it('writes ONE entry with the inserted count, after the inserts', async () => {
    const res = await createImportRows({ import_id: 'imp-1', rows: parsed(250) } as never);
    expect(res).toEqual({ count: 250, error: null });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'bank_statement_imports',
        entityId: 'imp-1',
        newValues: expect.objectContaining({ rows_created: 250 }),
      })
    );
    expect(calls.at(-1)).toBe('audit');
  });

  it('does not audit when an insert fails', async () => {
    results['bank_statement_rows.insert'] = { error: boom };
    const res = await createImportRows({ import_id: 'imp-1', rows: parsed(3) } as never);
    expect(res.count).toBe(0);
    expect(logAudit).not.toHaveBeenCalled();
  }, 15000);
});
