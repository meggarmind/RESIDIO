/**
 * Issue #777: processImport made several serial queries per row (one status update per skipped,
 * duplicate or failed row; three hash lookups per matched credit). It now loads the hashes once,
 * checks them in memory and writes non-created statuses in grouped updates, with the same results.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import { processImport } from '@/actions/imports/process-import';

const { authorizePermission, createServerSupabaseClient, logAudit, createPaymentCore, createExpense, updateImportStatus } =
  vi.hoisted(() => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    logAudit: vi.fn(),
    createPaymentCore: vi.fn(),
    createExpense: vi.fn(),
    updateImportStatus: vi.fn(),
  }));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentCore }));
vi.mock('@/actions/expenses/create-expense', () => ({ createExpense }));
vi.mock('@/actions/expenses/update-expense', () => ({ updateExpenseStatus: vi.fn() }));
vi.mock('@/lib/imports/update-import-status', () => ({ updateImportStatus }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));

type Row = Record<string, unknown>;
type Filter = { kind: 'eq' | 'in' | 'gte' | 'lte'; col: string; val: unknown };
type Entry = { table: string; op: string; vals?: Row; filters: Filter[]; range?: [number, number] };

let db: Record<string, Row[]>;
let log: Entry[];

const cmp = (a: unknown, b: unknown) => {
  if (typeof a === 'string' || typeof b === 'string') {
    const x = String(a);
    const y = String(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
};

// In-memory tables; updates write through, so a row created earlier in the run is visible to later checks.
function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const entry: Entry = { table, op: '', filters: [] };
      log.push(entry);
      const orders: string[] = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => ((entry.op ||= 'select'), chain);
      chain.update = (v: Row) => ((entry.op ||= 'update'), (entry.vals = v), chain);
      chain.eq = (col: string, val: unknown) => (entry.filters.push({ kind: 'eq', col, val }), chain);
      chain.in = (col: string, val: unknown) => (entry.filters.push({ kind: 'in', col, val }), chain);
      chain.gte = (col: string, val: unknown) => (entry.filters.push({ kind: 'gte', col, val }), chain);
      chain.lte = (col: string, val: unknown) => (entry.filters.push({ kind: 'lte', col, val }), chain);
      chain.order = (col: string) => (orders.push(col), chain);
      chain.range = (from: number, to: number) => ((entry.range = [from, to]), chain);

      const matching = () => {
        let out = (db[table] ?? []).filter((r) =>
          entry.filters.every((f) => {
            const v = r[f.col];
            if (f.kind === 'eq') return v === f.val;
            if (f.kind === 'in') return (f.val as unknown[]).includes(v);
            if (f.kind === 'gte') return cmp(v, f.val) >= 0;
            return cmp(v, f.val) <= 0;
          })
        );
        out = [...out].sort((a, b) => {
          for (const c of orders) {
            const d = cmp(a[c], b[c]);
            if (d !== 0) return d;
          }
          return 0;
        });
        if (entry.range) out = out.slice(entry.range[0], entry.range[1] + 1);
        return out;
      };
      const settle = () => {
        const rows = matching();
        if (entry.op === 'update') {
          for (const r of rows) Object.assign(r, entry.vals);
          return { data: rows.map((r) => ({ ...r })), error: null };
        }
        return { data: rows.map((r) => ({ ...r })), error: null };
      };
      // Mirrors PostgREST: maybeSingle errors on more than one match.
      chain.maybeSingle = async () => {
        const rows = matching();
        return rows.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: rows[0] ?? null, error: null };
      };
      chain.single = async () => {
        const rows = matching();
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not single' } };
      };
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    },
  };
}

const IMPORT = uid(1);
const RESIDENT = uid(2);
const CATEGORY = uid(3);
let seq = 0;

function row(over: Row): Row {
  seq++;
  return {
    id: uid(1000 + seq),
    import_id: IMPORT,
    row_number: seq,
    status: 'matched',
    transaction_type: 'credit',
    description: `Transfer ${seq}`,
    amount: 1000 + seq,
    reference: null,
    transaction_date: '2026-01-10',
    transaction_hash: null,
    matched_resident_id: RESIDENT,
    matched_project_id: null,
    matched_petty_cash_account_id: null,
    matched_expense_category_id: null,
    tag_id: null,
    error_message: null,
    payment_id: null,
    ...over,
  };
}

function seed(rows: Row[]) {
  db = {
    bank_statement_imports: [{ id: IMPORT, status: 'approved', file_name: 'jan.csv', total_rows: rows.length }],
    bank_statement_rows: [
      ...rows,
      // Created by an earlier import: its hash marks a credit here as already imported.
      row({ id: uid(9001), import_id: uid(9000), status: 'created', transaction_hash: 'h-row', payment_id: uid(9002) }),
    ],
    payment_records: [
      { id: uid(8001), transaction_hash: 'h-pay', reference_number: null, amount: 1, payment_date: '2020-01-01' },
      { id: uid(8002), transaction_hash: null, reference_number: 'REF-DUP', amount: 2, payment_date: '2020-01-01' },
    ],
    expenses: [{ id: uid(7001), transaction_hash: 'h-exp', status: 'paid', amount: 3, expense_date: '2020-01-01' }],
    expense_categories: [],
    hierarchical_settings: [],
  };
}

let paymentSeq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  log = [];
  seq = 0;
  paymentSeq = 0;
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockResolvedValue(undefined);
  createServerSupabaseClient.mockImplementation(async () => makeSupabase());
  updateImportStatus.mockResolvedValue({ error: null });
  createPaymentCore.mockImplementation(async (input: { amount: number }) =>
    input.amount === 666 ? { data: null, error: 'Payment write failed' } : { data: { id: uid(5000 + ++paymentSeq) }, error: null }
  );
  createExpense.mockImplementation(async () => ({ id: uid(6000 + ++paymentSeq) }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const statusOf = (id: unknown) => {
  const r = db.bank_statement_rows.find((x) => x.id === id)!;
  return [r.status, r.error_message ?? null, r.payment_id ?? null];
};

describe('processImport outcomes (#777 characterisation)', () => {
  function fixture() {
    return {
      created: row({ transaction_hash: 'h-new' }),
      unmatchedCredit: row({ matched_resident_id: null }),
      zeroAmount: row({ amount: 0 }),
      dupPay: row({ transaction_hash: 'h-pay' }),
      dupExp: row({ transaction_hash: 'h-exp' }),
      dupRow: row({ transaction_hash: 'h-row' }),
      dupRef: row({ reference: 'REF-DUP' }),
      sameHashFirst: row({ transaction_hash: 'h-twice' }),
      sameHashSecond: row({ transaction_hash: 'h-twice' }),
      untaggedDebit: row({ transaction_type: 'debit', matched_resident_id: null }),
      categorisedDebit: row({ transaction_type: 'debit', matched_resident_id: null, matched_expense_category_id: CATEGORY }),
      failedPayment: row({ amount: 666 }),
      noDate: row({ transaction_date: null, transaction_hash: 'h-pay' }),
    };
  }

  it('gives every row the same status, message and link, and the same counters', async () => {
    const f = fixture();
    seed(Object.values(f));

    const res = await processImport({ import_id: IMPORT });

    expect(statusOf(f.created.id)).toEqual(['created', null, uid(5001)]);
    expect(statusOf(f.unmatchedCredit.id)).toEqual(['skipped', null, null]);
    expect(statusOf(f.zeroAmount.id)).toEqual(['skipped', 'Invalid amount', null]);
    expect(statusOf(f.dupPay.id)).toEqual(['duplicate', 'Duplicate transaction hash in payments', null]);
    expect(statusOf(f.dupExp.id)).toEqual(['duplicate', 'Duplicate transaction hash in expenses', null]);
    expect(statusOf(f.dupRow.id)).toEqual(['duplicate', 'Duplicate transaction hash (already imported)', null]);
    expect(statusOf(f.dupRef.id)).toEqual(['duplicate', 'Duplicate reference number: REF-DUP', null]);
    expect(statusOf(f.sameHashFirst.id)).toEqual(['created', null, uid(5002)]);
    expect(statusOf(f.sameHashSecond.id)).toEqual(['duplicate', 'Duplicate transaction hash (already imported)', null]);
    expect(statusOf(f.untaggedDebit.id)).toEqual(['skipped', null, null]);
    expect(statusOf(f.categorisedDebit.id)).toEqual(['created', null, uid(6003)]);
    expect(statusOf(f.failedPayment.id)).toEqual(['error', 'Payment write failed', null]);
    // No date: the duplicate check is skipped, as before.
    expect(statusOf(f.noDate.id)).toEqual(['created', null, uid(5004)]);

    expect(res).toMatchObject({
      success: true,
      created_count: 4,
      created_payments_count: 3,
      created_expenses_count: 1,
      skipped_count: 8,
      error_count: 1,
      errors: [{ row_id: f.failedPayment.id, error: 'Payment write failed' }],
    });
    expect(updateImportStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'completed', created_rows: 4, skipped_rows: 8, error_rows: 1 })
    );
  });

  it('records "No assignment matched" as an error when unmatched rows are processed', async () => {
    const unmatched = row({ status: 'unmatched', matched_resident_id: null });
    const other = row({ status: 'unmatched', matched_resident_id: null });
    seed([unmatched, other]);

    const res = await processImport({ import_id: IMPORT, skip_unmatched: false });

    expect(statusOf(unmatched.id)).toEqual(['error', 'No assignment matched', null]);
    expect(statusOf(other.id)).toEqual(['error', 'No assignment matched', null]);
    expect(res).toMatchObject({ error_count: 2, skipped_count: 0, created_count: 0 });
    expect(res.errors).toEqual([
      { row_id: unmatched.id, error: 'No assignment matched' },
      { row_id: other.id, error: 'No assignment matched' },
    ]);
  });

  it('atomic mode stops at the first error and still writes the earlier skips', async () => {
    const skipped = row({ amount: 0 });
    const failed = row({ amount: 666 });
    const never = row({});
    seed([skipped, failed, never]);

    const res = await processImport({ import_id: IMPORT, mode: 'atomic' });

    expect(statusOf(skipped.id)).toEqual(['skipped', 'Invalid amount', null]);
    expect(statusOf(failed.id)).toEqual(['error', 'Payment write failed', null]);
    expect(statusOf(never.id)).toEqual(['matched', null, null]);
    expect(res).toMatchObject({ success: false, skipped_count: 1, error_count: 1, created_count: 0 });
  });
});

describe('processImport query count (#777)', () => {
  it('a 200-row import stays within a fixed query budget', async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 50; i++) rows.push(row({ transaction_hash: `h-${i}` })); // created
    for (let i = 0; i < 50; i++) rows.push(row({ transaction_hash: 'h-pay' })); // duplicate by hash
    for (let i = 0; i < 50; i++) rows.push(row({ matched_resident_id: null })); // skipped, unmatched
    for (let i = 0; i < 50; i++) rows.push(row({ amount: 0 })); // skipped, invalid amount
    seed(rows);

    await processImport({ import_id: IMPORT });

    const statuses = db.bank_statement_rows.filter((r) => r.import_id === IMPORT).map((r) => r.status);
    expect(statuses.filter((s) => s === 'created')).toHaveLength(50);
    expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(50);
    expect(statuses.filter((s) => s === 'skipped')).toHaveLength(100);
    expect(log.length).toBeLessThanOrEqual(QUERY_BUDGET);
  });
});

// Before #777 this fixture took 507 queries (three hash reads, the guardrail reads and a status update per row);
// after, 118: one guardrail read and one created-status write per created row, the rest batched.
const QUERY_BUDGET = 150;
