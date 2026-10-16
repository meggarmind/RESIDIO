/**
 * Issue #556 item 8 -- admin write actions that were permission-guarded but
 * never audited. Each now calls logAudit once, only after the write succeeded.
 * (Import actions are covered in audit-gap-imports.test.ts.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, expectUuidEntityId, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { setPrimaryVehicle } from '@/actions/security/vehicles';
import { reorderCategories } from '@/actions/security/categories';
import { deleteGeneratedReport } from '@/actions/reports/report-schedules';
import { tagImportRow, batchTagImportRows } from '@/actions/reference/transaction-tags';
import { restoreNoteVersion } from '@/actions/notes/get-note-history';
import { togglePettyCashAccountStatus } from '@/actions/finance/petty-cash';

const { authorizePermission, createServerSupabaseClient, logAudit, calls, results, selects } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
  selects: [] as string[],
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const boom = { message: 'boom' };

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  selects.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockImplementation(async () => {
    calls.push('audit');
  });
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls, selects }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('setPrimaryVehicle audit (#556)', () => {
  // setPrimaryVehicle is one atomic rpc('set_primary_vehicle') since #302.
  const rpcResult: { current: QueryResult } = { current: {} };
  beforeEach(() => {
    rpcResult.current = { data: { id: uid(1), contact_id: uid(8), plate_number: 'ABC-123' } };
    createServerSupabaseClient.mockImplementation(async () => ({
      ...makeRecordingSupabase({ results, calls, selects }),
      rpc: async (fn: string) => {
        calls.push(`write:rpc.${fn}`);
        return { data: rpcResult.current.data ?? null, error: rpcResult.current.error ?? null };
      },
    }));
  });

  it('audits an UPDATE after the writes succeed', async () => {
    const res = await setPrimaryVehicle(uid(1));
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'visitor_vehicles', entityId: uid(1) })
    );
    expect(calls.at(-1)).toBe('audit');
    expect(calls.indexOf('audit')).toBeGreaterThan(calls.lastIndexOf('write:rpc.set_primary_vehicle'));
  });

  it('does not audit when the update fails', async () => {
    rpcResult.current = { error: boom };
    await setPrimaryVehicle(uid(1));
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('reorderCategories audit (#556)', () => {
  it('writes ONE bounded entry for the whole call', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => uid(100 + i));
    const res = await reorderCategories(ids);
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'security_contact_categories' });
    expect(arg.newValues.total_count).toBe(60);
    expect(arg.newValues.ordered_ids).toHaveLength(50);
  });

  it('uses the first category id as entityId (not a sentinel)', async () => {
    await reorderCategories([uid(7), uid(8)]);
    expect(logAudit.mock.calls[0][0].entityId).toBe(uid(7));
  });

  it('does not audit an empty batch', async () => {
    const res = await reorderCategories([]);
    expect(res.success).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when a row update fails', async () => {
    results['security_contact_categories.update'] = { error: boom };
    const res = await reorderCategories([uid(10), uid(11)]);
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('deleteGeneratedReport audit (#556)', () => {
  it('audits a DELETE carrying what was deleted, after the delete', async () => {
    results['generated_reports.select'] = { data: { id: uid(2), name: 'Q1 Report', report_type: 'financial' } };
    const res = await deleteGeneratedReport(uid(2));
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityId: uid(2),
        oldValues: expect.objectContaining({ name: 'Q1 Report' }),
      })
    );
    expect(calls).toEqual(['write:generated_reports.delete', 'audit']);
  });

  it('never copies report_data into the audit entry', async () => {
    results['generated_reports.select'] = {
      data: { id: uid(2), name: 'Q1 Report', report_type: 'financial' },
    };
    await deleteGeneratedReport(uid(2));
    const selected = selects.filter((s) => s.startsWith('generated_reports:'));
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toMatch(/report_data|\*/);
    const oldValues = logAudit.mock.calls[0][0].oldValues as Record<string, unknown>;
    expect(oldValues).not.toHaveProperty('report_data');
  });

  it('does not audit when the delete fails', async () => {
    results['generated_reports.delete'] = { error: boom };
    const res = await deleteGeneratedReport(uid(2));
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('transaction tag audits (#556)', () => {
  it('tagImportRow audits an UPDATE on success only', async () => {
    await tagImportRow(uid(3), uid(6));
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'bank_statement_imports', entityId: uid(3) })
    );
    expect(calls).toEqual(['write:bank_statement_rows.update', 'audit']);

    logAudit.mockClear();
    results['bank_statement_rows.update'] = { error: boom };
    const res = await tagImportRow(uid(3), uid(6));
    expect(res.error).toBe('boom');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('batchTagImportRows writes ONE bounded entry with counts', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => uid(200 + i));
    results['bank_statement_rows.update'] = { count: 70 };
    const res = await batchTagImportRows(ids, uid(6));
    expect(res.updated).toBe(70);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    const arg = logAudit.mock.calls[0][0];
    expect(arg).toMatchObject({ action: 'UPDATE', entityType: 'bank_statement_imports' });
    expect(arg.newValues).toMatchObject({ tag_id: uid(6), total_count: 70, updated: 70 });
    expect(arg.newValues.row_ids).toHaveLength(50);
  });

  it('batchTagImportRows uses the first row id as entityId, and skips an empty batch', async () => {
    await batchTagImportRows([uid(9), uid(10)], uid(6));
    expect(logAudit.mock.calls[0][0].entityId).toBe(uid(9));
    logAudit.mockClear();
    await batchTagImportRows([], uid(6));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('batchTagImportRows does not audit on error', async () => {
    results['bank_statement_rows.update'] = { error: boom };
    await batchTagImportRows([uid(2)], null);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('restoreNoteVersion audit (#556)', () => {
  beforeEach(() => {
    results['entity_notes.select'] = { data: { id: '11111111-1111-4111-8111-111111111111', parent_note_id: null, title: 'T', entity_type: 'house' } };
    results['entity_notes.insert'] = { data: { id: uid(7) } };
  });

  it('audits an UPDATE on the new version after the insert', async () => {
    const res = await restoreNoteVersion('11111111-1111-4111-8111-111111111111', 1);
    expect(res.error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'entity_notes', entityId: uid(7) })
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
    const res = await togglePettyCashAccountStatus(uid(4), isActive);
    expect(res.success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action, entityType: 'petty_cash_accounts', entityId: uid(4) })
    );
    expect(calls).toEqual(['write:petty_cash_accounts.update', 'audit']);
  });

  it('does not audit when the update fails', async () => {
    results['petty_cash_accounts.update'] = { error: boom };
    const res = await togglePettyCashAccountStatus(uid(4), true);
    expect(res.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
