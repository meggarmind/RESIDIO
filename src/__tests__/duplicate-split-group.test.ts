/**
 * Issue #1443: lines of one split alert share a reference; the duplicate guard must not
 * count a row of the same split group, but must still flag any other row with that reference.
 */
import { describe, expect, it } from 'vitest';
import { checkDuplicateGuardrail } from '@/lib/matching/duplicate-matcher';

type Row = Record<string, unknown>;

/** Fake payment_records client that honours eq and the `or` group filter the guard adds. */
function clientWith(rows: Row[]) {
  return {
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
      chain.gte = () => chain;
      chain.lte = () => chain;
      chain.or = (expr: string) => {
        const m = expr.match(/^split_payment_group_id\.is\.null,split_payment_group_id\.neq\.(.+)$/);
        if (!m) throw new Error(`unexpected or(): ${expr}`);
        filters.push((r) => r.split_payment_group_id == null || r.split_payment_group_id !== m[1]);
        return chain;
      };
      chain.limit = () => chain;
      const matches = () => rows.filter((r) => filters.every((f) => f(r)));
      chain.maybeSingle = async () => ({ data: matches()[0] ?? null, error: null });
      chain.then = (ok: (v: unknown) => unknown) => ok({ data: matches(), error: null });
      return chain;
    },
  };
}

const tx = { amount: 600, date: '2026-10-31', residentId: 'res_1', reference: 'REF-1' };
const row = (extra: Row): Row => ({ id: 'p1', reference_number: 'REF-1', amount: 400, payment_date: '2026-10-31', resident_id: 'res_1', ...extra });
const opts = (rows: Row[]) => ({ threshold: 90, client: clientWith(rows) as never });

describe('checkDuplicateGuardrail split group (#1443)', () => {
  it('ignores a row of the same split group', async () => {
    const r = await checkDuplicateGuardrail({ ...tx, splitPaymentGroupId: 'g1' }, 'payment', opts([row({ split_payment_group_id: 'g1' })]));
    expect(r.isDuplicate).toBe(false);
  });

  it('still flags a row of a different group with the same reference', async () => {
    const r = await checkDuplicateGuardrail({ ...tx, splitPaymentGroupId: 'g1' }, 'payment', opts([row({ split_payment_group_id: 'g2' })]));
    expect(r).toMatchObject({ isDuplicate: true, matchType: 'exact' });
  });

  it('still flags a row with no group', async () => {
    const r = await checkDuplicateGuardrail({ ...tx, splitPaymentGroupId: 'g1' }, 'payment', opts([row({ split_payment_group_id: null })]));
    expect(r.isDuplicate).toBe(true);
  });

  it('flags the same-group row when no group id is given (unchanged behaviour)', async () => {
    const r = await checkDuplicateGuardrail(tx, 'payment', opts([row({ split_payment_group_id: 'g1' })]));
    expect(r.isDuplicate).toBe(true);
  });

  it('ignores a same-group row in the fuzzy check too (no reference)', async () => {
    const fuzzy = { amount: 400, date: '2026-10-31', residentId: 'res_1', splitPaymentGroupId: 'g1' };
    const same = await checkDuplicateGuardrail(fuzzy, 'payment', opts([row({ split_payment_group_id: 'g1' })]));
    expect(same.matchType).toBe('none');
    const other = await checkDuplicateGuardrail(fuzzy, 'payment', opts([row({ split_payment_group_id: 'g2' })]));
    expect(other.score).toBeGreaterThan(0);
  });
});
