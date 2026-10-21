/**
 * Issue #994: the amount + date-window duplicate search selected columns that do not exist
 * (`description` / `expense_date` on payment_records, `payment_date` on expenses). PostgREST
 * answered with an error, the code ignored it, and every same-amount deposit read as "not a
 * duplicate". The fake client here rejects any column missing from the generated schema, as
 * PostgREST does, so the real query shape is exercised.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDuplicateGuardrail } from '@/lib/matching/duplicate-matcher';
import { checkDuplicatesBatch } from '@/actions/imports/process-import';

const { createServerSupabaseClient } = vi.hoisted(() => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

const generated = readFileSync(join(process.cwd(), 'src/types/database.generated.ts'), 'utf8');

/** Column names of a table's Row type in the generated schema. */
function columnsOf(table: string): Set<string> {
  const match = generated.match(new RegExp(`\\n      ${table}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`));
  if (!match) throw new Error(`table ${table} not in database.generated.ts`);
  return new Set(match[1].split('\n').map((line) => line.trim().split(':')[0]));
}

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let forcedError: { message: string } | null;

function makeSupabase() {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let fields: Array<[alias: string, column: string]> = [];
      let error: { message: string } | null = null;
      let range: [number, number] | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        const known = columnsOf(table);
        fields = cols.split(',').map((f) => {
          const [alias, column = alias] = f.trim().split(':').map((s) => s.trim());
          if (!known.has(column)) error ??= { message: `column ${table}.${column} does not exist` };
          return [alias, column];
        });
        return chain;
      };
      chain.eq = (col: string, val: unknown) => (filters.push((r) => r[col] === val), chain);
      chain.in = (col: string, val: unknown[]) => (filters.push((r) => val.includes(r[col])), chain);
      chain.gte = (col: string, val: string) => (filters.push((r) => String(r[col]).slice(0, 10) >= val.slice(0, 10)), chain);
      chain.lte = (col: string, val: string) => (filters.push((r) => String(r[col]).slice(0, 10) <= val.slice(0, 10)), chain);
      chain.order = () => chain;
      chain.range = (from: number, to: number) => ((range = [from, to]), chain);
      const rows = () => {
        const out = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return (range ? out.slice(range[0], range[1] + 1) : out).map((r) => Object.fromEntries(fields.map(([a, c]) => [a, r[c]])));
      };
      const settle = () => {
        const err = forcedError ?? error;
        return err ? { data: null, error: err } : { data: rows(), error: null };
      };
      chain.maybeSingle = async () => {
        const res = settle();
        return res.error ? res : { data: res.data![0] ?? null, error: null };
      };
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(settle()).then(res, rej);
      return chain;
    },
  };
}

beforeEach(() => {
  forcedError = null;
  db = {
    hierarchical_settings: [{ setting_key: 'duplicate_matching_threshold', value: 90 }],
    // A deposit typed in by hand, with a different reference from the bank statement line.
    payment_records: [
      { id: 'pay-1', amount: 50000, payment_date: '2026-10-01', notes: 'Transfer from John Doe', reference_number: 'MANUAL-1', resident_id: 'res-1' },
    ],
    expenses: [{ id: 'exp-1', amount: 12000, expense_date: '2026-10-01', description: 'Generator diesel' }],
    expense_categories: [],
    bank_statement_rows: [],
  };
  createServerSupabaseClient.mockResolvedValue(makeSupabase());
});

describe('duplicate search selects only real columns (#994)', () => {
  it('flags a bank import of a hand-typed payment with a different reference', async () => {
    const result = await checkDuplicateGuardrail(
      { amount: 50000, date: '2026-10-01', residentId: 'res-1', reference: 'BANK-REF-9', description: 'Transfer from John Doe' },
      'payment'
    );
    expect(result).toMatchObject({ isDuplicate: true, existingId: 'pay-1' });
  });

  it('flags a re-entered expense', async () => {
    const result = await checkDuplicateGuardrail({ amount: 12000, date: '2026-10-01', description: 'Generator diesel' }, 'expense');
    expect(result).toMatchObject({ isDuplicate: true, existingId: 'exp-1' });
  });

  it('flags the same deposit in a batch import', async () => {
    const batch = await checkDuplicatesBatch([
      { id: 'row-1', reference: 'BANK-REF-9', amount: 50000, transaction_date: '2026-10-01', transaction_hash: null, description: 'Transfer from John Doe' },
    ]);
    expect(batch.get('row-1')).toMatchObject({ is_duplicate: true, existing_payment_id: 'pay-1' });
  });

  it('surfaces a failed candidate query instead of answering "not a duplicate"', async () => {
    forcedError = { message: 'boom' };
    await expect(checkDuplicateGuardrail({ amount: 50000, date: '2026-10-01' }, 'payment', { threshold: 90 })).rejects.toThrow(
      'Duplicate check failed: boom'
    );
  });

  it('surfaces a failed batch candidate query', async () => {
    const supabase = makeSupabase();
    const from = supabase.from.bind(supabase);
    // Only the payment_records amount lookup fails; hash and reference lookups succeed.
    createServerSupabaseClient.mockResolvedValue({
      from: (table: string) => {
        const chain = from(table) as Record<string, (...a: unknown[]) => unknown>;
        const select = chain.select;
        chain.select = (cols: string) => {
          if (table === 'payment_records' && cols.includes('payment_date')) forcedError = { message: 'boom' };
          return select(cols);
        };
        return chain;
      },
    });
    await expect(
      checkDuplicatesBatch([{ id: 'row-1', reference: null, amount: 50000, transaction_date: '2026-10-01', transaction_hash: null }])
    ).rejects.toThrow('Duplicate check failed');
  });
});
