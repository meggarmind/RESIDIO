/**
 * Issue #649: createImportRows queried transaction_tags once per row (N+1) and wrote each
 * auto-tag with its own update. Tags are now loaded once per distinct transaction type and
 * written one update per distinct tag.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uid } from '@/__tests__/helpers/recording-supabase';
import { createImportRows } from '@/actions/imports/create-import';
import { autoTagTransaction } from '@/actions/reference/transaction-tags';
import { findMatchingTag } from '@/lib/imports/auto-tag';

const { authorizePermission, createServerSupabaseClient, logAudit } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));

type Tag = { id: string; name: string; sort_order: number; transaction_type: string; keywords: string[] | null };

// Already in the order the database returns them (sort_order, then name).
const TAGS: Record<string, Tag[]> = {
  credit: [
    { id: 'c-dues', name: 'Dues', sort_order: 1, transaction_type: 'credit', keywords: ['security dues', 'DUES'] },
    { id: 'c-levy', name: 'Levy', sort_order: 2, transaction_type: 'credit', keywords: ['dues levy', 'LEVY'] },
    { id: 'c-empty', name: 'Empty', sort_order: 3, transaction_type: 'credit', keywords: [] },
    { id: 'c-null', name: 'Null', sort_order: 4, transaction_type: 'credit', keywords: null },
  ],
  debit: [
    { id: 'd-fuel', name: 'Fuel', sort_order: 1, transaction_type: 'debit', keywords: ['diesel'] },
    { id: 'd-dues', name: 'Bank', sort_order: 2, transaction_type: 'debit', keywords: ['dues'] },
  ],
};

type Entry = {
  table: string;
  op: string;
  vals?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown]>;
  orders: string[];
};

let log: Entry[];
let rowsInsertError: { message: string } | null;
let importStatus: string;
let tagsError: { message: string } | null;

function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from(table: string) {
      const entry: Entry = { table, op: '', eqs: [], ins: [], orders: [] };
      log.push(entry);
      const chain: Record<string, unknown> = {};
      const setOp = (op: string) => {
        if (!entry.op) entry.op = op;
      };
      chain.select = () => {
        setOp('select');
        return chain;
      };
      chain.insert = () => {
        setOp('insert');
        return chain;
      };
      chain.update = (v: Record<string, unknown>) => {
        setOp('update');
        entry.vals = v;
        return chain;
      };
      chain.delete = () => {
        setOp('delete');
        return chain;
      };
      chain.eq = (c: string, v: unknown) => {
        entry.eqs.push([c, v]);
        return chain;
      };
      chain.in = (c: string, v: unknown) => {
        entry.ins.push([c, v]);
        return chain;
      };
      chain.order = (c: string) => {
        entry.orders.push(c);
        return chain;
      };
      const settle = () => {
        if (table === 'transaction_tags') {
          const type = entry.eqs.find(([c]) => c === 'transaction_type')?.[1] as string;
          return tagsError ? { data: null, error: tagsError } : { data: TAGS[type] ?? [], error: null };
        }
        if (table === 'bank_statement_rows' && entry.op === 'insert') return { data: null, error: rowsInsertError };
        if (table === 'bank_statement_imports' && entry.op === 'select') return { data: { status: importStatus }, error: null };
        if (table === 'bank_statement_imports' && entry.op === 'update') return { data: [{ id: uid(1) }], error: null };
        return { data: null, error: null };
      };
      chain.single = async () => settle();
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(res, rej);
      return chain;
    },
  };
}

// Types alternate so even a 3-row import contains both.
const descs = [
  'Annual SECURITY DUES payment', // credit: Dues via 'security dues'
  'Diesel purchase', // debit: Fuel
  'dues levy 2026', // credit: Dues wins over Levy (ordering)
  'Bank dues charge', // debit: Bank
  'Monthly LeVy', // credit: Levy, case-insensitive
  'Office rent', // debit: no match
  'Random transfer', // credit: no match
];
const types = ['credit', 'debit', 'credit', 'debit', 'credit', 'debit', 'credit'];

function makeRows(n: number, withKeywordRows = true) {
  return Array.from({ length: n }, (_, i) => ({
    row_number: i + 1,
    raw_data: {},
    transaction_date: null,
    description: withKeywordRows ? descs[i % descs.length] : `row ${i}`,
    amount: null,
    transaction_type: withKeywordRows ? types[i % types.length] : i % 2 ? 'debit' : 'credit',
    reference: null,
  }));
}

const tagQueries = () => log.filter((e) => e.table === 'transaction_tags');
const rowUpdates = () => log.filter((e) => e.table === 'bank_statement_rows' && e.op === 'update');

beforeEach(() => {
  vi.clearAllMocks();
  log = [];
  rowsInsertError = null;
  importStatus = 'pending';
  tagsError = null;
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  createServerSupabaseClient.mockImplementation(async () => makeSupabase());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createImportRows auto-tag round trips (#649)', () => {
  for (const n of [3, 30]) {
    it(`issues at most 2 transaction_tags queries for ${n} rows of both types`, async () => {
      const res = await createImportRows({ import_id: uid(1), rows: makeRows(n) } as never);
      expect(res).toEqual({ count: n, error: null });
      expect(tagQueries().length).toBeLessThanOrEqual(2);
      expect(tagQueries().map((q) => q.eqs.find(([c]) => c === 'transaction_type')?.[1]).sort()).toEqual(['credit', 'debit']);
    });
  }

  it('issues exactly one tags query when all rows share a type, and none when no row is taggable', async () => {
    const credit = makeRows(10).map((r) => ({ ...r, transaction_type: 'credit' }));
    await createImportRows({ import_id: uid(1), rows: credit } as never);
    expect(tagQueries()).toHaveLength(1);

    log = [];
    const none = makeRows(5).map((r) => ({ ...r, description: null, transaction_type: null }));
    await createImportRows({ import_id: uid(1), rows: none } as never);
    expect(tagQueries()).toHaveLength(0);
  });

  it('writes one update per distinct tag, not per row, scoped by import_id', async () => {
    await createImportRows({ import_id: uid(1), rows: makeRows(30) } as never);
    const updates = rowUpdates();
    expect(updates).toHaveLength(4); // c-dues, c-levy, d-fuel, d-dues
    for (const u of updates) {
      expect(u.vals).toMatchObject({ auto_tagged: true });
      expect(u.eqs).toContainEqual(['import_id', uid(1)]);
      expect(u.ins[0][0]).toBe('row_number');
    }
    const byTag = Object.fromEntries(updates.map((u) => [u.vals!.tag_id as string, u.ins[0][1] as number[]]));
    const tagForPattern = ['c-dues', 'd-fuel', 'c-dues', 'd-dues', 'c-levy', null, null];
    const expected: Record<string, number[]> = {};
    for (let i = 0; i < 30; i++) {
      const t = tagForPattern[i % 7];
      if (t) (expected[t] ??= []).push(i + 1);
    }
    expect(byTag).toEqual(expected);
  });

  it('writes no tag updates when nothing matches', async () => {
    await createImportRows({ import_id: uid(1), rows: makeRows(30, false) } as never);
    expect(rowUpdates()).toHaveLength(0);
  });

  it('leaves rows untagged (and still succeeds) when the tags lookup fails', async () => {
    tagsError = { message: 'down' };
    const res = await createImportRows({ import_id: uid(1), rows: makeRows(7) } as never);
    expect(res).toEqual({ count: 7, error: null });
    expect(rowUpdates()).toHaveLength(0);
  });
});

describe('tag assignment is identical to per-row autoTagTransaction semantics (#649)', () => {
  it('matches the per-row result for every fixture description', async () => {
    for (let i = 0; i < descs.length; i++) {
      const type = types[i] as 'credit' | 'debit';
      const legacy = await autoTagTransaction(descs[i], type);
      const shared = findMatchingTag(TAGS[type] as never, descs[i]);
      expect(shared.tag?.id ?? null).toBe(legacy.tag?.id ?? null);
      expect(shared.matchedKeyword).toBe(legacy.matchedKeyword);
    }
  });

  it('covers ordering, case-insensitivity, no keywords and no match', () => {
    const credit = TAGS.credit as never;
    expect(findMatchingTag(credit, 'dues levy').tag?.id).toBe('c-dues'); // earlier sort_order wins
    expect(findMatchingTag(credit, 'MONTHLY levy').tag?.id).toBe('c-levy');
    expect(findMatchingTag(credit, 'MONTHLY levy').matchedKeyword).toBe('LEVY');
    expect(findMatchingTag(credit, 'nothing here').tag).toBeNull();
    expect(findMatchingTag([TAGS.credit[2], TAGS.credit[3]] as never, 'anything').tag).toBeNull();
    expect(findMatchingTag(null, 'x').tag).toBeNull();
    expect(findMatchingTag(credit, 'diesel').tag).toBeNull(); // debit keyword never tags credit
    expect(findMatchingTag(TAGS.debit as never, 'diesel').tag?.id).toBe('d-fuel');
  });
});

describe('createImportRows tag lookup and chunking (#649)', () => {
  it('loads only active tags, ordered by sort_order then name', async () => {
    await createImportRows({ import_id: uid(1), rows: makeRows(3) } as never);
    const queries = tagQueries();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.eqs).toContainEqual(['is_active', true]);
      expect(q.orders).toEqual(['sort_order', 'name']);
    }
  });

  it('splits a tag with more than 200 rows into chunks of at most 200 that cover every row once', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => ({
      row_number: i + 1,
      raw_data: {},
      transaction_date: null,
      description: 'Annual SECURITY DUES payment',
      amount: null,
      transaction_type: 'credit',
      reference: null,
    }));
    await createImportRows({ import_id: uid(1), rows } as never);
    const updates = rowUpdates();
    expect(updates).toHaveLength(3);
    const sent = updates.flatMap((u) => u.ins.find(([c]) => c === 'row_number')?.[1] as number[]);
    for (const u of updates) {
      expect((u.ins.find(([c]) => c === 'row_number')?.[1] as number[]).length).toBeLessThanOrEqual(200);
    }
    expect(sent.slice().sort((a, b) => a - b)).toEqual(rows.map((r) => r.row_number));
  });
});

describe('createImportRows existing behaviour is preserved (#649)', () => {
  it('rejects a non-pending import before any insert or tag query', async () => {
    importStatus = 'processing';
    const res = await createImportRows({ import_id: uid(1), rows: makeRows(3) } as never);
    expect(res.error).toMatch(/status: processing/);
    expect(log.some((e) => e.op === 'insert')).toBe(false);
    expect(tagQueries()).toHaveLength(0);
  });

  it('rolls back and skips tagging when an insert fails', async () => {
    rowsInsertError = { message: 'boom' };
    const res = await createImportRows({ import_id: uid(1), rows: makeRows(3) } as never);
    expect(res.count).toBe(0);
    expect(log.some((e) => e.table === 'bank_statement_rows' && e.op === 'delete')).toBe(true);
    expect(tagQueries()).toHaveLength(0);
    expect(logAudit).not.toHaveBeenCalled();
  }, 15000);

  it('rejects more than MAX_IMPORT_ROWS rows', async () => {
    const res = await createImportRows({ import_id: uid(1), rows: makeRows(50000) } as never);
    expect(res.error).toMatch(/at most/);
    expect(log).toHaveLength(0);
  });
});
