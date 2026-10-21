/**
 * Issue #707 (owner decisions on #668 Q2 and Q3):
 *  - rows of a submitted import are what the approver signs off, so the row-edit actions refuse
 *    (no write, no audit) unless the import is still pending/processing;
 *  - processImport claims the import (approved -> posting, guarded) before creating any payment,
 *    so two concurrent runs create payments once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import {
  batchUpdateRowStatus,
  manualMatchRow,
  matchImportRows,
  skipRow,
  unmatchRow,
} from '@/actions/imports/match-residents';
import { processImport } from '@/actions/imports/process-import';
import type { ImportStatus } from '@/types/database';

const { authorizePermission, createServerSupabaseClient, logAudit, fetchAllRows, createPaymentCore } = vi.hoisted(
  () => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    logAudit: vi.fn(),
    fetchAllRows: vi.fn(),
    createPaymentCore: vi.fn(),
  })
);

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows }));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentCore }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/actions/reference/transaction-tags', () => ({
  autoTagTransaction: vi.fn(async () => ({ tag: null, matchedKeyword: null })),
}));

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let writes: string[];

// In-memory tables. A guarded update checks and writes in one synchronous step, as the database
// does for a single UPDATE ... WHERE status = 'approved'.
function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      let op = '';
      let vals: Row = {};
      const filters: Array<[string, unknown, 'eq' | 'in']> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => ((op ||= 'select'), chain);
      chain.update = (v: Row) => ((op ||= 'update'), (vals = v), chain);
      chain.insert = (v: Row) => ((op ||= 'insert'), (vals = v), chain);
      chain.eq = (c: string, v: unknown) => (filters.push([c, v, 'eq']), chain);
      chain.in = (c: string, v: unknown) => (filters.push([c, v, 'in']), chain);
      for (const m of ['order', 'limit', 'range', 'neq', 'is', 'gte', 'lte', 'or']) chain[m] = () => chain;
      const matching = () =>
        (db[table] ?? []).filter((r) =>
          filters.every(([c, v, k]) => (k === 'eq' ? r[c] === v : (v as unknown[]).includes(r[c])))
        );
      const settle = () => {
        const rows = matching();
        if (op === 'update') {
          writes.push(`${table}.update`);
          for (const r of rows) Object.assign(r, vals);
        } else if (op === 'insert') {
          writes.push(`${table}.insert`);
          return { data: vals, error: null };
        }
        return { data: rows.map((r) => ({ ...r })), error: null, count: rows.length };
      };
      const one = async () => {
        const { data } = settle();
        const first = (Array.isArray(data) ? data[0] : data) ?? null;
        return { data: first, error: first ? null : { message: 'not found' } };
      };
      chain.single = one;
      chain.maybeSingle = one;
      chain.limit = () => chain;
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    },
  };
}

const IMPORT = uid(1);
const ROW = uid(2);
const RESIDENT = uid(3);

function seed(status: ImportStatus) {
  db = {
    bank_statement_imports: [{ id: IMPORT, status, file_name: 'jan.csv', total_rows: 2, matched_rows: 0 }],
    bank_statement_rows: [
      {
        id: ROW,
        import_id: IMPORT,
        row_number: 1,
        status: 'matched',
        transaction_type: 'credit',
        amount: 5000,
        description: 'RESIDENT transfer',
        reference: 'REF-1',
        transaction_date: '2026-01-10',
        transaction_hash: null,
        matched_resident_id: RESIDENT,
      },
      {
        id: uid(4),
        import_id: IMPORT,
        row_number: 2,
        status: 'pending',
        transaction_type: 'credit',
        amount: 100,
        description: 'Other',
        reference: null,
        transaction_date: '2026-01-11',
        transaction_hash: null,
      },
    ],
    residents: [{ id: RESIDENT, first_name: 'Ada', last_name: 'Obi', resident_code: 'R1' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockResolvedValue(undefined);
  createServerSupabaseClient.mockImplementation(async () => makeSupabase());
  fetchAllRows.mockImplementation(async () => ({
    data: db.bank_statement_rows.filter((r) => r.status === 'matched').map((r) => ({ ...r })),
    error: null,
  }));
  createPaymentCore.mockImplementation(async () => ({ data: { id: uid(99) }, error: null }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const ROW_ACTIONS: Array<[string, () => Promise<{ error?: string | null }>]> = [
  ['manualMatchRow', () => manualMatchRow({ row_id: ROW, resident_id: RESIDENT })],
  ['unmatchRow', () => unmatchRow(ROW)],
  ['skipRow', () => skipRow(ROW)],
  ['batchUpdateRowStatus', () => batchUpdateRowStatus({ row_ids: [ROW], status: 'skipped' })],
  ['matchImportRows', () => matchImportRows(IMPORT)],
];

const LOCKED: ImportStatus[] = ['awaiting_approval', 'approved', 'posting', 'completed', 'failed', 'rejected'];

describe('row edits are locked once the import is submitted (#707)', () => {
  for (const [name, run] of ROW_ACTIONS) {
    for (const status of LOCKED) {
      it(`${name} refuses on a ${status} import: no write, no audit`, async () => {
        seed(status);
        const res = await run();
        expect(res.error).toMatch(/rows can no longer be changed/);
        expect(writes).toEqual([]);
        expect(logAudit).not.toHaveBeenCalled();
      });
    }
  }

  for (const [name, run] of ROW_ACTIONS.filter(([n]) => n !== 'matchImportRows')) {
    for (const status of ['pending', 'processing'] as ImportStatus[]) {
      it(`${name} still writes on a ${status} import`, async () => {
        seed(status);
        const res = await run();
        expect(res.error ?? null).toBeNull();
        expect(writes).toContain('bank_statement_rows.update');
      });
    }
  }
});

describe('processImport claims the import before creating payments (#707)', () => {
  it('moves approved -> posting -> completed and creates the payment', async () => {
    seed('approved');
    const res = await processImport({ import_id: IMPORT, skip_duplicates: false });
    expect(res.success).toBe(true);
    expect(createPaymentCore).toHaveBeenCalledTimes(1);
    expect(db.bank_statement_imports[0].status).toBe('completed');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ oldValues: { status: 'approved' }, newValues: { status: 'posting' } })
    );
  });

  it('two concurrent runs create the payment once', async () => {
    seed('approved');
    const [a, b] = await Promise.all([
      processImport({ import_id: IMPORT, skip_duplicates: false }),
      processImport({ import_id: IMPORT, skip_duplicates: false }),
    ]);
    expect(createPaymentCore).toHaveBeenCalledTimes(1);
    const loser = [a, b].find((r) => !r.success);
    expect(loser?.errors[0].error).toBe('Import is already being processed by another run');
    expect(loser?.created_payments_count).toBe(0);
    expect(db.bank_statement_imports[0].status).toBe('completed');
  });

  it('creates nothing and reads no rows when the claim updates zero rows', async () => {
    seed('approved');
    // Another run claims it between this run's status read and its claim.
    const real = makeSupabase();
    createServerSupabaseClient.mockImplementation(async () => ({
      ...real,
      from(table: string) {
        const chain = real.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>;
        const update = chain.update;
        chain.update = (v: unknown) => {
          db.bank_statement_imports[0].status = 'posting';
          return update(v);
        };
        return chain;
      },
    }));
    const res = await processImport({ import_id: IMPORT, skip_duplicates: false });
    expect(res.success).toBe(false);
    expect(res.errors[0].error).toBe('Import is already being processed by another run');
    expect(createPaymentCore).not.toHaveBeenCalled();
    expect(fetchAllRows).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('ends the claim as failed when the row read fails, so it is not stuck in posting', async () => {
    seed('approved');
    fetchAllRows.mockResolvedValue({ data: null, error: 'boom' });
    const res = await processImport({ import_id: IMPORT, skip_duplicates: false });
    expect(res.success).toBe(false);
    expect(createPaymentCore).not.toHaveBeenCalled();
    expect(db.bank_statement_imports[0].status).toBe('failed');
  });
});
