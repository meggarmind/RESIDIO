import { describe, expect, it } from 'vitest';
import {
    selectAllButNewestCoveredBy,
    selectOldestUpTo,
    selectYear,
    summarize,
    unpaidBalance,
    type WriteOffBill,
} from '@/lib/billing/write-off-selection';

/** The mockup's sample (#1460): 77 monthly bills, Jul 2020 to Nov 2026; 5,000 to Dec 2024, 10,000 from Jan 2025. */
function mockupBills(): WriteOffBill[] {
    const bills: WriteOffBill[] = [];
    let y = 2020;
    let m = 6;
    while (!(y === 2026 && m === 11)) {
        const month = String(m + 1).padStart(2, '0');
        bills.push({ id: `b-${y}-${month}`, period_start: `${y}-${month}-01`, amount_due: y < 2025 ? 5000 : 10000, amount_paid: 0 });
        m += 1;
        if (m > 11) {
            m = 0;
            y += 1;
        }
    }
    // Shuffle the order so the helpers must sort by period_start themselves.
    return bills.reverse();
}

describe('write-off smart select (#1460)', () => {
    it('builds the mockup sample: 77 bills for 500,000', () => {
        const bills = mockupBills();
        expect(bills).toHaveLength(77);
        expect(summarize(bills, []).owedAfter).toBe(500000);
    });

    it('keeps the newest bills a 240,000 payment covers and selects the other 52 bills (260,000)', () => {
        const bills = mockupBills();
        const ids = selectAllButNewestCoveredBy(bills, 240000);
        expect(ids).toHaveLength(52);
        expect(ids[0]).toBe('b-2020-07');
        expect(ids[51]).toBe('b-2024-10');
        const totals = summarize(bills, ids, 240000);
        expect(totals).toEqual({ count: 52, total: 260000, owedAfter: 0 });
    });

    it('goes on past a bill the payment cannot cover', () => {
        const bills: WriteOffBill[] = [
            { id: 'old', period_start: '2024-01-01', amount_due: 1000, amount_paid: 0 },
            { id: 'mid', period_start: '2024-02-01', amount_due: 9000, amount_paid: 0 },
            { id: 'new', period_start: '2024-03-01', amount_due: 2000, amount_paid: 0 },
        ];
        // 3,500 covers "new" (2,000), not "mid" (9,000), then covers "old" (1,000).
        expect(selectAllButNewestCoveredBy(bills, 3500)).toEqual(['mid']);
        expect(selectAllButNewestCoveredBy(bills, 0)).toEqual(['old', 'mid', 'new']);
    });

    it('selects the oldest bills up to an agreed amount, exact or with the gap', () => {
        const bills = mockupBills();
        const exact = selectOldestUpTo(bills, 270000);
        expect(exact).toMatchObject({ total: 270000, exact: true, gap: 0 });
        expect(exact.ids).toHaveLength(54);
        expect(exact.ids[0]).toBe('b-2020-07');

        // 272,000: the next bill (Jan 2025, 10,000) does not fit, so it stops at 270,000.
        const short = selectOldestUpTo(bills, 272000);
        expect(short).toMatchObject({ total: 270000, exact: false, gap: 2000 });
        expect(short.ids).toHaveLength(54);

        expect(selectOldestUpTo(bills, 4999)).toEqual({ ids: [], total: 0, exact: false, gap: 4999 });
    });

    it('uses the unpaid balance of a part-paid bill', () => {
        const bills: WriteOffBill[] = [
            { id: 'part', period_start: '2020-01-01', amount_due: 5000, amount_paid: 2000 },
            { id: 'full', period_start: '2020-02-01', amount_due: 5000, amount_paid: 0 },
        ];
        expect(unpaidBalance(bills[0])).toBe(3000);
        expect(selectOldestUpTo(bills, 8000)).toMatchObject({ ids: ['part', 'full'], total: 8000, exact: true });
        expect(summarize(bills, ['part'])).toEqual({ count: 1, total: 3000, owedAfter: 5000 });
    });

    it('selects the bills of one year, oldest first', () => {
        const bills = mockupBills();
        expect(selectYear(bills, 2020)).toEqual(['b-2020-07', 'b-2020-08', 'b-2020-09', 'b-2020-10', 'b-2020-11', 'b-2020-12']);
        expect(selectYear(bills, 2026)).toHaveLength(11);
        expect(selectYear(bills, 2019)).toEqual([]);
    });

    it('summarizes a selection: owed after never goes below zero, and unknown ids are ignored', () => {
        const bills = mockupBills();
        const all = bills.map((b) => b.id);
        expect(summarize(bills, all)).toEqual({ count: 77, total: 500000, owedAfter: 0 });
        expect(summarize(bills, ['b-2026-10', 'nope'], 1000000)).toEqual({ count: 1, total: 10000, owedAfter: 0 });
        expect(summarize(bills, ['b-2026-10'], 100000)).toEqual({ count: 1, total: 10000, owedAfter: 390000 });
    });
});
