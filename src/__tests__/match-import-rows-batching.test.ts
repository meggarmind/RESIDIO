/**
 * Issue #649: matchImportRows made ~6 to 8 sequential round trips per row (duplicate checks, a category
 * read per unmatched debit, one update per row). It now batches duplicate checks, loads categories once
 * and writes identical payloads in grouped updates, with the same results.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import { matchImportRows } from '@/actions/imports/match-residents';
import { checkDuplicate, checkDuplicatesBatch } from '@/actions/imports/process-import';
import { autoMatchExpenseCategory } from '@/actions/expenses/get-expense-categories';
import { findMatchingExpenseCategory } from '@/lib/expenses/category-matcher';
import { pickBestDuplicate } from '@/lib/matching/duplicate-matcher';

const { authorizePermission, createServerSupabaseClient, logAudit } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
// Descriptions containing RESIDENT match a resident; everything else is unmatched.
vi.mock('@/lib/matching', () => ({
  createMatcher: () => ({
    match: ({ description }: { description: string }) =>
      description.includes('RESIDENT')
        ? { resident_id: 'res-1', confidence: 'high', method: 'exact', matched_value: 'x' }
        : { resident_id: null, confidence: 'none', method: null },
  }),
}));

type Row = Record<string, unknown>;
type Filter = { kind: 'eq' | 'in' | 'gte' | 'lte'; col: string; val: unknown };
type Entry = {
  table: string;
  op: string;
  vals?: Row;
  filters: Filter[];
  range?: [number, number];
};

let db: Record<string, Row[]>;
let log: Entry[];
let updateError: { message: string } | null;

const cmp = (a: unknown, b: unknown) => {
  if (typeof a === 'string' || typeof b === 'string') {
    const x = String(a).slice(0, 10);
    const y = String(b).slice(0, 10);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return Number(a) - Number(b);
};

function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const entry: Entry = { table, op: '', filters: [] };
      log.push(entry);
      const orders: string[] = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => {
        if (!entry.op) entry.op = 'select';
        return chain;
      };
      chain.update = (v: Row) => {
        if (!entry.op) entry.op = 'update';
        entry.vals = v;
        return chain;
      };
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
        if (entry.op === 'update') return { data: null, error: table === 'bank_statement_rows' ? updateError : null };
        return { data: matching(), error: null };
      };
      // Mirrors PostgREST: maybeSingle errors on more than one match.
      chain.maybeSingle = async () => {
        const rows = matching();
        return rows.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: rows[0] ?? null, error: null };
      };
      chain.single = chain.maybeSingle;
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    },
  };
}

const count = (table: string, op: string) => log.filter((e) => e.table === table && e.op === op).length;
const tableCounts = () => {
  const out: Record<string, number> = {};
  for (const e of log) out[`${e.table}.${e.op}`] = (out[`${e.table}.${e.op}`] ?? 0) + 1;
  return out;
};
const rowUpdates = () => log.filter((e) => e.table === 'bank_statement_rows' && e.op === 'update');
const idsOf = (e: Entry) => e.filters.find((f) => f.kind === 'in' && f.col === 'id')!.val as string[];

const IMPORT = uid(1);
let seq = 0;
function pending(over: Row): Row {
  seq++;
  return {
    id: uid(1000 + seq),
    import_id: IMPORT,
    row_number: seq,
    status: 'pending',
    description: 'Some text',
    amount: 100,
    reference: null,
    transaction_date: '2026-01-10',
    transaction_hash: null,
    transaction_type: 'credit',
    ...over,
  };
}

const CATEGORIES = [
  { id: 'cat-fuel', name: 'Fuel', sort_order: 1, is_active: true, keywords: ['diesel'] },
  { id: 'cat-bank', name: 'Bank', sort_order: 2, is_active: true, keywords: ['bank charge', 'DIESEL'] },
  { id: 'cat-none', name: 'None', sort_order: 3, is_active: true, keywords: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  log = [];
  updateError = null;
  db = {
    payment_records: [],
    expenses: [],
    bank_statement_rows: [],
    hierarchical_settings: [],
    expense_categories: [...CATEGORIES],
  };
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  logAudit.mockResolvedValue(undefined);
  createServerSupabaseClient.mockImplementation(async () => makeSupabase());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ------------------------------------------------------------------------------------------------
// Duplicate fixtures shared by the equivalence tests
// ------------------------------------------------------------------------------------------------
function seedDuplicateWorld(threshold?: number) {
  db.payment_records = [
    { id: 'p1', transaction_hash: 'H-PAY', reference_number: 'REF-P', amount: 500, payment_date: '2026-01-10', description: 'Alpha transfer' },
    { id: 'p-both', transaction_hash: 'H-BOTH', reference_number: null, amount: 1, payment_date: '2020-01-01', description: 'x' },
    { id: 'p2', transaction_hash: null, reference_number: null, amount: 700, payment_date: '2026-02-01', description: 'Beta rent' },
    { id: 'p3', transaction_hash: null, reference_number: null, amount: 700, payment_date: '2026-02-01', description: 'Gamma rent' },
  ];
  db.expenses = [
    { id: 'e1', transaction_hash: 'H-EXP' },
    { id: 'e-both', transaction_hash: 'H-BOTH' },
  ];
  db.bank_statement_rows = [
    { id: 'r1', status: 'created', payment_id: 'pay-9', transaction_hash: 'H-ROW' },
    { id: 'r-pending', status: 'pending', payment_id: null, transaction_hash: 'H-PENDING' },
    { id: 'r-hash-all', status: 'created', payment_id: 'pay-1', transaction_hash: 'H-ALL' },
  ];
  db.payment_records.push({ id: 'p-all', transaction_hash: 'H-ALL', reference_number: null, amount: 2, payment_date: '2020-01-01', description: 'x' });
  db.expenses.push({ id: 'e-all', transaction_hash: 'H-ALL' });
  if (threshold !== undefined) db.hierarchical_settings = [{ setting_key: 'duplicate_matching_threshold', value: threshold }];
}

type Scenario = {
  name: string;
  row: { reference: string | null; amount: number; transaction_date: string; transaction_hash: string | null; description: string | null };
  expected: Row;
};

const SCENARIOS: Scenario[] = [
  { name: 'hash in payments', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-PAY', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'p1', reason: 'Duplicate transaction hash in payments' } },
  { name: 'hash in expenses', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-EXP', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'e1', reason: 'Duplicate transaction hash in expenses' } },
  { name: 'hash in created rows', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-ROW', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'pay-9', reason: 'Duplicate transaction hash (already imported)' } },
  { name: 'hash in payments and expenses: payments wins', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-BOTH', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'p-both', reason: 'Duplicate transaction hash in payments' } },
  { name: 'hash in all three: payments wins', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-ALL', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'p-all', reason: 'Duplicate transaction hash in payments' } },
  { name: 'hash only in a not-yet-created row is not a duplicate', row: { reference: null, amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-PENDING', description: 'q' }, expected: { is_duplicate: false } },
  { name: 'hash beats a matching reference', row: { reference: 'REF-P', amount: 9, transaction_date: '2026-03-01', transaction_hash: 'H-EXP', description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'e1', reason: 'Duplicate transaction hash in expenses' } },
  { name: 'exact reference', row: { reference: 'REF-P', amount: 9, transaction_date: '2026-03-01', transaction_hash: null, description: 'q' }, expected: { is_duplicate: true, existing_payment_id: 'p1', reason: 'Duplicate reference number: REF-P' } },
  { name: 'reference beats a fuzzy candidate', row: { reference: 'REF-P', amount: 700, transaction_date: '2026-02-01', transaction_hash: null, description: 'Gamma rent' }, expected: { is_duplicate: true, existing_payment_id: 'p1', reason: 'Duplicate reference number: REF-P' } },
  { name: 'fuzzy above threshold, highest score wins', row: { reference: null, amount: 700, transaction_date: '2026-02-02', transaction_hash: null, description: 'Gamma rent' }, expected: { is_duplicate: true, existing_payment_id: 'p3', reason: 'Potential duplicate with 100% confidence (Threshold: 90%)' } },
  { name: 'fuzzy below threshold', row: { reference: null, amount: 500, transaction_date: '2026-01-11', transaction_hash: null, description: 'zzz qqq unrelated' }, expected: { is_duplicate: false } },
  { name: 'outside the date window', row: { reference: null, amount: 500, transaction_date: '2026-01-20', transaction_hash: null, description: 'Alpha transfer' }, expected: { is_duplicate: false } },
  { name: 'different amount', row: { reference: null, amount: 501, transaction_date: '2026-01-10', transaction_hash: null, description: 'Alpha transfer' }, expected: { is_duplicate: false } },
  { name: 'nothing at all', row: { reference: 'REF-NEW', amount: 12, transaction_date: '2027-01-01', transaction_hash: 'H-NEW', description: null }, expected: { is_duplicate: false } },
];

describe('checkDuplicatesBatch equals the single-row checkDuplicate (#649)', () => {
  for (const s of SCENARIOS) {
    it(s.name, async () => {
      seedDuplicateWorld();
      const single = await checkDuplicate(s.row.reference, s.row.amount, s.row.transaction_date, 1, s.row.transaction_hash, s.row.description);
      const batch = await checkDuplicatesBatch([{ id: 'x', ...s.row }]);
      expect(batch.get('x')).toEqual(single);
      expect(batch.get('x')).toEqual(s.expected);
    });
  }

  it('gives every row its own result when all scenarios run in one batch', async () => {
    seedDuplicateWorld();
    const batch = await checkDuplicatesBatch(SCENARIOS.map((s, i) => ({ id: `row-${i}`, ...s.row })));
    SCENARIOS.forEach((s, i) => expect(batch.get(`row-${i}`)).toEqual(s.expected));
  });

  it('honours a stored threshold (read once for the batch)', async () => {
    seedDuplicateWorld(40);
    const row = { id: 'x', reference: null, amount: 500, transaction_date: '2026-01-11', transaction_hash: null, description: 'zzz qqq unrelated' };
    const single = await checkDuplicate(row.reference, row.amount, row.transaction_date, 1, null, row.description);
    expect(single.is_duplicate).toBe(true);
    log = [];
    const batch = await checkDuplicatesBatch([row, { ...row, id: 'y' }]);
    expect(batch.get('x')).toEqual(single);
    expect(batch.get('x')).toEqual({
      is_duplicate: true,
      existing_payment_id: 'p1',
      reason: 'Potential duplicate with 50% confidence (Threshold: 40%)',
    });
    expect(count('hierarchical_settings', 'select')).toBe(1);
  });

  it('treats an unparseable date as "no fuzzy candidates" instead of throwing', async () => {
    seedDuplicateWorld();
    const batch = await checkDuplicatesBatch([{ id: 'x', reference: null, amount: 500, transaction_date: '', transaction_hash: null }]);
    expect(batch.get('x')).toEqual({ is_duplicate: false });
  });

  it('returns an empty map and queries nothing for no rows', async () => {
    const batch = await checkDuplicatesBatch([]);
    expect(batch.size).toBe(0);
    expect(log).toHaveLength(0);
  });

  it('chunks hash lookups at 200 values', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({
      id: `r${i}`,
      reference: null,
      amount: null,
      transaction_date: '2026-01-10',
      transaction_hash: `hash-${i}`,
    }));
    await checkDuplicatesBatch(rows);
    const payQueries = log.filter((e) => e.table === 'payment_records' && e.filters.some((f) => f.col === 'transaction_hash'));
    expect(payQueries).toHaveLength(3);
    for (const q of payQueries) {
      expect((q.filters.find((f) => f.col === 'transaction_hash')!.val as string[]).length).toBeLessThanOrEqual(200);
    }
  });
});

describe('pickBestDuplicate and threshold boundary (#649)', () => {
  const target = { amount: 5, date: new Date('2026-01-10'), description: 'alpha' };
  const cand = (id: string, description: string) => ({ id, description, amount: 5, payment_date: '2026-01-10' });

  it('is a duplicate exactly at the threshold and not one point below it', () => {
    expect(pickBestDuplicate(target, [cand('a', 'zzz')], 50).isDuplicate).toBe(true);
    expect(pickBestDuplicate(target, [cand('a', 'zzz')], 51).isDuplicate).toBe(false);
  });

  it('keeps the first candidate on a tie and the highest score otherwise', () => {
    expect(pickBestDuplicate(target, [cand('first', 'zzz'), cand('second', 'zzz')], 10).existingId).toBe('first');
    expect(pickBestDuplicate(target, [cand('low', 'zzz'), cand('high', 'alpha')], 10)).toMatchObject({ existingId: 'high', score: 100, matchType: 'exact' });
  });

  it('returns "none" without candidates', () => {
    expect(pickBestDuplicate(target, [], 10)).toEqual({ isDuplicate: false, score: 0, matchType: 'none' });
  });
});

describe('findMatchingExpenseCategory (#649)', () => {
  const cats = CATEGORIES as never;

  it('matches case-insensitively and returns the keyword as stored', () => {
    expect(findMatchingExpenseCategory(cats, 'Bought DiEsEl today')).toMatchObject({ matchedKeyword: 'diesel' });
    expect(findMatchingExpenseCategory(cats, 'Bought DiEsEl today').category?.id).toBe('cat-fuel');
  });

  it('earlier category wins even when a later one also matches', () => {
    expect(findMatchingExpenseCategory(cats, 'diesel and bank charge').category?.id).toBe('cat-fuel');
    expect(findMatchingExpenseCategory(cats, 'monthly bank charge').category?.id).toBe('cat-bank');
  });

  it('returns no match for no keywords, no hit, or no categories', () => {
    expect(findMatchingExpenseCategory(cats, 'office rent')).toEqual({ category: null, matchedKeyword: null });
    expect(findMatchingExpenseCategory([CATEGORIES[2]] as never, 'anything')).toEqual({ category: null, matchedKeyword: null });
    expect(findMatchingExpenseCategory(null, 'diesel')).toEqual({ category: null, matchedKeyword: null });
  });

  it('autoMatchExpenseCategory returns the same as the pure helper for the same data', async () => {
    for (const d of ['Bought DiEsEl today', 'diesel and bank charge', 'monthly bank charge', 'office rent', '']) {
      expect(await autoMatchExpenseCategory(d)).toEqual(findMatchingExpenseCategory(cats, d));
    }
  });
});

// ------------------------------------------------------------------------------------------------
// matchImportRows
// ------------------------------------------------------------------------------------------------
function mixedRows(n: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 4;
    out.push(
      pending({
        amount: 1000 + i,
        reference: `NEWREF-${i}`,
        transaction_hash: `NEWHASH-${i}`,
        ...(kind === 0 && { description: 'RESIDENT dues', transaction_type: 'credit' }),
        ...(kind === 1 && { description: 'diesel purchase', transaction_type: 'debit' }),
        ...(kind === 2 && { description: 'office rent', transaction_type: 'debit' }),
        ...(kind === 3 && { description: 'mystery credit', transaction_type: 'credit' }),
      })
    );
  }
  return out;
}

describe('matchImportRows round trips do not grow with row count (#649)', () => {
  it('issues the same number of queries per table for 3 rows and 30 rows', async () => {
    db.bank_statement_rows = mixedRows(3);
    const small = await matchImportRows(IMPORT);
    const smallCounts = tableCounts();
    expect(small.error).toBeNull();

    log = [];
    seq = 0;
    db.bank_statement_rows = mixedRows(30);
    const large = await matchImportRows(IMPORT);
    const largeCounts = tableCounts();
    expect(large.error).toBeNull();
    expect(large.results).toHaveLength(30);

    // Both runs contain the same three distinct update payloads, so every table count is identical.
    expect(largeCounts).toEqual(smallCounts);
    expect(count('expense_categories', 'select')).toBe(1);
    expect(Object.values(largeCounts).reduce((a, b) => a + b, 0)).toBe(16);
  });

  it('reads expense categories at most once however many debits are unmatched, and never when there are none', async () => {
    db.bank_statement_rows = Array.from({ length: 20 }, () => pending({ description: 'office rent', transaction_type: 'debit' }));
    await matchImportRows(IMPORT);
    expect(count('expense_categories', 'select')).toBe(1);

    log = [];
    seq = 0;
    db.bank_statement_rows = Array.from({ length: 5 }, () => pending({ description: 'RESIDENT x', transaction_type: 'debit' }));
    await matchImportRows(IMPORT);
    expect(count('expense_categories', 'select')).toBe(0);
  });
});

describe('matchImportRows payloads and counters (#649)', () => {
  it('keeps the quirk: a category-matched debit gets no duplicate_reason; counters move unmatched to matched', async () => {
    db.payment_records = [{ id: 'p1', transaction_hash: 'DUP-1', reference_number: null, amount: 1, payment_date: '2020-01-01', description: 'x' }];
    const resident = pending({ description: 'RESIDENT dues', transaction_type: 'credit' });
    const catDebitDup = pending({ description: 'diesel purchase', transaction_type: 'debit', transaction_hash: 'DUP-1' });
    const plainDebit = pending({ description: 'office rent', transaction_type: 'debit' });
    const dupCredit = pending({ description: 'mystery credit', transaction_type: 'credit', transaction_hash: 'DUP-1' });
    db.bank_statement_rows = [resident, catDebitDup, plainDebit, dupCredit];

    const res = await matchImportRows(IMPORT);
    expect(res.error).toBeNull();
    expect(res.matched_count).toBe(2);
    expect(res.unmatched_count).toBe(2);

    const payloadFor = (id: unknown) => rowUpdates().find((u) => idsOf(u).includes(id as string))!.vals!;

    const cat = payloadFor(catDebitDup.id);
    expect(cat).toEqual({
      matched_resident_id: null,
      match_confidence: 'high',
      match_method: 'keyword',
      status: 'matched',
      matched_expense_category_id: 'cat-fuel',
    });
    expect(cat).not.toHaveProperty('duplicate_reason');

    expect(payloadFor(resident.id)).toEqual({
      matched_resident_id: 'res-1',
      match_confidence: 'high',
      match_method: 'exact',
      status: 'matched',
      duplicate_reason: null,
    });
    expect(payloadFor(plainDebit.id)).toEqual({
      matched_resident_id: null,
      match_confidence: 'none',
      match_method: null,
      status: 'unmatched',
      duplicate_reason: null,
    });
    expect(payloadFor(dupCredit.id)).toMatchObject({ status: 'unmatched', duplicate_reason: 'Duplicate transaction hash in payments' });

    expect(res.results.map((r) => r.resident_id)).toEqual(['res-1', null, null, null]);

    const importUpdate = log.find((e) => e.table === 'bank_statement_imports' && e.op === 'update')!;
    expect(importUpdate.vals).toEqual({ matched_rows: 2 });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit.mock.calls[0][0]).toMatchObject({
      action: 'UPDATE',
      entityType: 'bank_statement_imports',
      entityId: IMPORT,
      entityDisplay: 'Auto-matched 4 import rows',
      newValues: { total_count: 4, matched_count: 2, unmatched_count: 2, row_ids: [resident.id, catDebitDup.id, plainDebit.id, dupCredit.id] },
    });
  });

  it('writes the duplicate_reason for a duplicate that is matched to a resident', async () => {
    db.payment_records = [{ id: 'p1', transaction_hash: null, reference_number: 'REF-DUP', amount: 1, payment_date: '2020-01-01', description: 'x' }];
    const r = pending({ description: 'RESIDENT dues', reference: 'REF-DUP' });
    db.bank_statement_rows = [r];
    await matchImportRows(IMPORT);
    expect(rowUpdates()[0].vals).toMatchObject({ status: 'matched', duplicate_reason: 'Duplicate reference number: REF-DUP' });
  });

  it('does not touch rows that are not pending or belong to another import, and returns early with none', async () => {
    db.bank_statement_rows = [pending({ status: 'matched' }), pending({ import_id: uid(99) })];
    const res = await matchImportRows(IMPORT);
    expect(res).toEqual({ results: [], matched_count: 0, unmatched_count: 0, error: null });
    expect(rowUpdates()).toHaveLength(0);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('requires authorization before any query', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    const res = await matchImportRows(IMPORT);
    expect(res.error).toBe('nope');
    expect(log.filter((e) => e.table !== 'x')).toHaveLength(0);
  });
});

describe('matchImportRows grouped updates (#649)', () => {
  it('writes identical payloads with ONE update carrying every id', async () => {
    const rows = Array.from({ length: 30 }, () => pending({ description: 'RESIDENT dues' }));
    db.bank_statement_rows = rows;
    await matchImportRows(IMPORT);
    const updates = rowUpdates();
    expect(updates).toHaveLength(1);
    expect(idsOf(updates[0])).toEqual(rows.map((r) => r.id));
    // no per-row eq('id', ...) update remains
    expect(updates[0].filters.some((f) => f.kind === 'eq' && f.col === 'id')).toBe(false);
  });

  it('splits different payloads into different updates, one per distinct payload', async () => {
    db.bank_statement_rows = [
      pending({ description: 'RESIDENT dues' }),
      pending({ description: 'RESIDENT again' }),
      pending({ description: 'office rent', transaction_type: 'debit' }),
      pending({ description: 'diesel', transaction_type: 'debit' }),
      pending({ description: 'bank charge', transaction_type: 'debit' }),
    ];
    await matchImportRows(IMPORT);
    const updates = rowUpdates();
    expect(updates).toHaveLength(4); // resident, unmatched debit, fuel, bank
    expect(updates.map((u) => idsOf(u).length).sort()).toEqual([1, 1, 1, 2]);
  });

  it('chunks a bucket at 200 ids and covers every row exactly once', async () => {
    const rows = Array.from({ length: 450 }, () => pending({ description: 'RESIDENT dues' }));
    db.bank_statement_rows = rows;
    await matchImportRows(IMPORT);
    const updates = rowUpdates();
    expect(updates).toHaveLength(3);
    for (const u of updates) expect(idsOf(u).length).toBeLessThanOrEqual(200);
    expect(updates.flatMap(idsOf).sort()).toEqual(rows.map((r) => r.id as string).sort());
  });

  it('logs a failed grouped update with context but keeps the same response and still audits', async () => {
    updateError = { message: 'db down' };
    db.bank_statement_rows = [pending({ description: 'RESIDENT dues' }), pending({ description: 'RESIDENT two' })];
    const res = await matchImportRows(IMPORT);
    expect(res).toMatchObject({ error: null, matched_count: 2, unmatched_count: 0 });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(IMPORT), updateError);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});
