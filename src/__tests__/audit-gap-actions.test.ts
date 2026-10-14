/**
 * Issue #556 item 8 -- admin write actions that were permission-guarded but
 * never audited. Each now calls logAudit once, only after the write succeeded.
 * (Import actions are covered in audit-gap-imports.test.ts.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { setPrimaryVehicle } from '@/actions/security/vehicles';
import { reorderCategories } from '@/actions/security/categories';
import { deleteGeneratedReport } from '@/actions/reports/report-schedules';
import { tagImportRow, batchTagImportRows } from '@/actions/reference/transaction-tags';
import { restoreNoteVersion } from '@/actions/notes/get-note-history';
import { togglePettyCashAccountStatus } from '@/actions/finance/petty-cash';

const { authorizePermission, createServerSupabaseClient, logAudit, calls, results } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('setPrimaryVehicle audit (#556)', () => {
  beforeEach(() => {
    results['visitor_vehicles.select'] = { data: { contact_id: 'c1' } };
    results['visitor_vehicles.update'] = { data: { id: 'v1', plate_number: 'ABC-123' } };
  });

  it('audits an UPDATE after the writes succeed', async () => {
    const res = await setPrimaryVehicle('v1');
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'visitor_vehicles', entityId: 'v1' })
    );
    expect(calls.at(-1)).toBe('audit');
    expect(calls.indexOf('audit')).toBeGreaterThan(calls.lastIndexOf('write:visitor_vehicles.update'));
  });

  it('does not audit when the update fails', async () => {
    results['visitor_vehicles.update'] = { error: boom };
    await setPrimaryVehicle('v1');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('reorderCategories audit (#556)', () => {
  it('writes ONE bounded entry for the whole call', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `c${i}`);
    const res = await reorderCategories(ids);
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'security_contact_categories' });
    expect(arg.newValues.total_count).toBe(60);
    expect(arg.newValues.ordered_ids).toHaveLength(50);
  });

  it('does not audit when a row update fails', async () => {
    results['security_contact_categories.update'] = { error: boom };
    const res = await reorderCategories(['a', 'b']);
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('deleteGeneratedReport audit (#556)', () => {
  it('audits a DELETE carrying what was deleted, after the delete', async () => {
    results['generated_reports.select'] = { data: { id: 'r1', name: 'Q1 Report', report_type: 'financial' } };
    const res = await deleteGeneratedReport('r1');
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityId: 'r1',
        oldValues: expect.objectContaining({ name: 'Q1 Report' }),
      })
    );
    expect(calls).toEqual(['write:generated_reports.delete', 'audit']);
  });

  it('does not audit when the delete fails', async () => {
    results['generated_reports.delete'] = { error: boom };
    const res = await deleteGeneratedReport('r1');
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('transaction tag audits (#556)', () => {
  it('tagImportRow audits an UPDATE on success only', async () => {
    await tagImportRow('row-1', 'tag-1');
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'bank_statement_imports', entityId: 'row-1' })
    );
    expect(calls).toEqual(['write:bank_statement_rows.update', 'audit']);

    logAudit.mockClear();
    results['bank_statement_rows.update'] = { error: boom };
    const res = await tagImportRow('row-1', 'tag-1');
    expect(res.error).toBe('boom');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('batchTagImportRows writes ONE bounded entry with counts', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `r${i}`);
    results['bank_statement_rows.update'] = { count: 70 };
    const res = await batchTagImportRows(ids, 'tag-1');
    expect(res.updated).toBe(70);
    expect(logAudit).toHaveBeenCalledTimes(1);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'bank_statement_imports' });
    expect(arg.newValues).toMatchObject({ tag_id: 'tag-1', total_count: 70, updated: 70 });
    expect(arg.newValues.row_ids).toHaveLength(50);
  });

  it('batchTagImportRows does not audit on error', async () => {
    results['bank_statement_rows.update'] = { error: boom };
    await batchTagImportRows(['r1'], null);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('restoreNoteVersion audit (#556)', () => {
  beforeEach(() => {
    results['entity_notes.select'] = { data: { id: '11111111-1111-4111-8111-111111111111', parent_note_id: null, title: 'T', entity_type: 'house' } };
    results['entity_notes.insert'] = { data: { id: 'n2' } };
  });

  it('audits an UPDATE on the new version after the insert', async () => {
    const res = await restoreNoteVersion('11111111-1111-4111-8111-111111111111', 1);
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'entity_notes', entityId: 'n2' })
    );
    expect(calls).toEqual(['write:entity_notes.insert', 'audit']);
  });

  it('does not audit when the insert fails', async () => {
    results['entity_notes.insert'] = { error: boom };
    const res = await restoreNoteVersion('11111111-1111-4111-8111-111111111111', 1);
    expect(res.error).toBe('Failed to restore note version');
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('togglePettyCashAccountStatus audit (#556)', () => {
  it.each([
    [true, 'ACTIVATE'],
    [false, 'DEACTIVATE'],
  ])('isActive=%s audits %s after the update', async (isActive, action) => {
    const res = await togglePettyCashAccountStatus('pc-1', isActive);
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action, entityType: 'petty_cash_accounts', entityId: 'pc-1' })
    );
    expect(calls).toEqual(['write:petty_cash_accounts.update', 'audit']);
  });

  it('does not audit when the update fails', async () => {
    results['petty_cash_accounts.update'] = { error: boom };
    const res = await togglePettyCashAccountStatus('pc-1', true);
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
