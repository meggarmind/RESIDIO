import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, expectUuidEntityId, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  IMPORT_STATUS_TRANSITIONS,
  updateImportStatus,
} from '@/lib/imports/update-import-status';
import { processImport } from '@/actions/imports/process-import';
import { createImportRows } from '@/actions/imports/create-import';
import type { ImportStatus } from '@/types/database';

/**
 * Issue #556 item 5: updateImportStatus accepted any status from any IMPORTS_CREATE holder and
 * wrote no audit. It is now an internal lib helper with a transition table; its caller
 * (processImport) owns the IMPORTS_REVIEW check.
 */

const { authorizePermission, createServerSupabaseClient, logAudit, fetchAllRows, calls, results, selects } =
  vi.hoisted(() => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    logAudit: vi.fn(),
    fetchAllRows: vi.fn(),
    calls: [] as string[],
    results: {} as Record<string, QueryResult>,
    selects: [] as string[],
  }));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/actions/reference/transaction-tags', () => ({
  autoTagTransaction: vi.fn(async () => ({ tag: null, matchedKeyword: null })),
}));

const SCAN_TIMEOUT_MS = 30_000;
const root = fileURLToPath(new URL('../..', import.meta.url));
const LIB_FILE = 'src/lib/imports/update-import-status.ts';
const ALLOWED_IMPORTERS = ['src/actions/imports/process-import.ts'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (f: string) => relative(root, f).split('\\').join('/');
function sourceFiles(dir: string): string[] {
  return walk(join(root, dir)).filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.tsx?$/.test(rel(f)));
}
function exportsName(source: string, name: string): boolean {
  const decl = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${name}\\b`);
  const list = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`, 's');
  return decl.test(source) || list.test(source);
}

// Any specifier (alias, relative, dynamic import) naming the lib module.
const LIB_SPECIFIER = /['"][^'"]*update-import-status['"]/;
const LIB_REEXPORT = /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s*['"][^'"]*update-import-status['"]/;

describe('updateImportStatus is not a server action (#556)', () => {
  it('no file under src/actions re-exports the lib module (alias or relative, named or star)', () => {
    const offenders = sourceFiles('src/actions')
      .filter((f) => LIB_REEXPORT.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('scans a non-trivial set of action files', () => {
    expect(sourceFiles('src/actions').length).toBeGreaterThan(20);
  }, SCAN_TIMEOUT_MS);

  it('is not exported from any file under src/actions', () => {
    const offenders = sourceFiles('src/actions')
      .filter((f) => exportsName(readFileSync(f, 'utf8'), 'updateImportStatus'))
      .map(rel);
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it(`${LIB_FILE} has no 'use server' directive and exports it`, () => {
    const source = readFileSync(join(root, LIB_FILE), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use server['"]/m);
    expect(exportsName(source, 'updateImportStatus')).toBe(true);
  });

  it('only the known server-side caller imports the lib module', () => {
    const importers = sourceFiles('src')
      .filter((f) => LIB_SPECIFIER.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(importers).toEqual([...ALLOWED_IMPORTERS].sort());
  }, SCAN_TIMEOUT_MS);
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  selects.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  results['bank_statement_imports.update'] = { data: [{ id: uid(1) }] };
  logAudit.mockImplementation(async () => {
    calls.push('audit');
  });
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls, selects }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const ALL: ImportStatus[] = ['pending', 'processing', 'awaiting_approval', 'approved', 'completed', 'failed', 'rejected'];
// processImport accepts only an approved import (#628) and finishes it as completed or failed.
const LEGIT: Array<[ImportStatus, ImportStatus]> = (
  ['approved'] as ImportStatus[]
).flatMap((from) => (['completed', 'failed'] as ImportStatus[]).map((to) => [from, to] as [ImportStatus, ImportStatus]));

describe('updateImportStatus transition table (#556)', () => {
  for (const [from, to] of LEGIT) {
    it(`allows ${from} -> ${to} and writes`, async () => {
      results['bank_statement_imports.select'] = { data: { status: from } };
      const res = await updateImportStatus({ import_id: uid(1), status: to });
      expect(res.error).toBeNull();
      expect(calls).toEqual(['write:bank_statement_imports.update', 'audit']);
    });
  }

  const legitKeys = new Set(LEGIT.map(([f, t]) => `${f}>${t}`));
  for (const from of ALL) {
    for (const to of ALL) {
      if (legitKeys.has(`${from}>${to}`)) continue;
      it(`rejects ${from} -> ${to} with no write`, async () => {
        results['bank_statement_imports.select'] = { data: { status: from } };
        const res = await updateImportStatus({ import_id: uid(1), status: to });
        expect(res.error).toMatch(/Invalid import status transition/);
        expect(calls).toEqual([]);
      });
    }
  }

  it('the exported table matches the observed set exactly', () => {
    const actual = ALL.flatMap((f) => IMPORT_STATUS_TRANSITIONS[f].map((t) => `${f}>${t}`)).sort();
    expect(actual).toEqual([...legitKeys].sort());
  });

  it('writes nothing when the import does not exist', async () => {
    const res = await updateImportStatus({ import_id: uid(1), status: 'completed' });
    expect(res.error).toBe('Import not found');
    expect(calls).toEqual([]);
  });
});

describe('updateImportStatus concurrency guard (#556)', () => {
  it('guards the update on the validated status and asks for the rows back', async () => {
    const eqs: Array<[string, unknown]> = [];
    const selectsAfterUpdate: string[] = [];
    createServerSupabaseClient.mockImplementation(async () => ({
      from() {
        let op = '';
        const chain: Record<string, unknown> = {};
        chain.select = (cols: string) => {
          if (op === 'update') selectsAfterUpdate.push(cols);
          else op = 'select';
          return chain;
        };
        chain.update = () => {
          op = 'update';
          return chain;
        };
        // createImportRows loads auto-tag rules (transaction_tags) with .order(); #649
        chain.order = () => chain;
        chain.in = () => chain;
        chain.eq = (col: string, val: unknown) => {
          if (op === 'update') eqs.push([col, val]);
          return chain;
        };
        const settle = () =>
          op === 'update' ? { data: [{ id: uid(1) }], error: null } : { data: { status: 'approved' }, error: null };
        chain.single = async () => settle();
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res);
        return chain;
      },
    }));
    const res = await updateImportStatus({ import_id: uid(1), status: 'completed' });
    expect(res.error).toBeNull();
    expect(eqs).toContainEqual(['id', uid(1)]);
    expect(eqs).toContainEqual(['status', 'approved']);
    expect(selectsAfterUpdate).toEqual(['id, file_name']);
  });

  it('returns an error when zero rows were updated (lost race)', async () => {
    results['bank_statement_imports.select'] = { data: { status: 'approved' } };
    results['bank_statement_imports.update'] = { data: [] };
    const res = await updateImportStatus({ import_id: uid(1), status: 'completed' });
    expect(res.error).toMatch(/changed concurrently/);
  });

  it('returns ok when one row was updated', async () => {
    results['bank_statement_imports.select'] = { data: { status: 'approved' } };
    results['bank_statement_imports.update'] = { data: [{ id: uid(1) }] };
    const res = await updateImportStatus({ import_id: uid(1), status: 'completed' });
    expect(res.error).toBeNull();
  });
});

describe('createImportRows only accepts a pending import (#556)', () => {
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

  it('inserts rows and moves pending -> processing', async () => {
    results['bank_statement_imports.select'] = { data: { status: 'pending' } };
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res.error).toBeNull();
    expect(res.count).toBe(1);
    expect(calls).toContain('write:bank_statement_rows.insert');
    expect(calls).toContain('write:bank_statement_imports.update');
  });

  for (const status of ['processing', 'awaiting_approval', 'approved', 'rejected', 'completed', 'failed']) {
    it(`rejects ${status} with no insert and no status write`, async () => {
      results['bank_statement_imports.select'] = { data: { status } };
      const res = await createImportRows({ import_id: uid(1), rows });
      expect(res.error).toMatch(new RegExp(`status: ${status}`));
      expect(res.count).toBe(0);
      expect(calls.filter((c) => c.startsWith('write:'))).toEqual([]);
    });
  }

  it('rejects an unknown import with no writes', async () => {
    const res = await createImportRows({ import_id: uid(1), rows });
    expect(res.error).toBe('Import not found');
    expect(calls.filter((c) => c.startsWith('write:'))).toEqual([]);
  });
});

describe('processImport final status write under IMPORTS_REVIEW alone (#556)', () => {
  beforeEach(() => {
    // Reviewer holds IMPORTS_REVIEW but NOT IMPORTS_CREATE.
    authorizePermission.mockImplementation(async (perm: string) =>
      perm === PERMISSIONS.IMPORTS_REVIEW ? { authorized: true, userId: 'user-1' } : { authorized: false, error: 'Forbidden' },
    );
    fetchAllRows.mockResolvedValue({ data: [], error: null });
    results['bank_statement_imports.select'] = {
      data: { id: uid(1), file_name: 'jan.csv', status: 'approved', total_rows: 3 },
    };
  });

  it('completes the import and audits it once with the import uuid', async () => {
    const res = await processImport({ import_id: uid(1) });
    expect(res.success).toBe(true);
    expect(calls).toEqual(['write:bank_statement_imports.update', 'audit']);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'bank_statement_imports', newValues: expect.objectContaining({ status: 'completed' }) }),
    );
    expect(authorizePermission).not.toHaveBeenCalledWith(PERMISSIONS.IMPORTS_CREATE);
  });

  for (const status of ['processing', 'awaiting_approval', 'pending', 'rejected', 'completed', 'failed']) {
    it(`refuses a ${status} import: no row read, no write, no audit, no payments (#628)`, async () => {
      results['bank_statement_imports.select'] = {
        data: { id: uid(1), file_name: 'jan.csv', status, total_rows: 3 },
      };
      const res = await processImport({ import_id: uid(1) });
      expect(res.success).toBe(false);
      expect(res.created_payments_count).toBe(0);
      expect(res.errors[0].error).toBe(
        `Cannot process import with status: ${status}. Only approved imports can be processed.`,
      );
      expect(fetchAllRows).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(logAudit).not.toHaveBeenCalled();
    });
  }

  it('writes nothing when the caller lacks IMPORTS_REVIEW', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    const res = await processImport({ import_id: uid(1) });
    expect(res.success).toBe(false);
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
