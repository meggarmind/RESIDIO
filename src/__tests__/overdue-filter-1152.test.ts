import { describe, expect, it } from 'vitest';
import { applyOverdueFilter, overdueCutoffDate } from '@/lib/billing/overdue-filter';

function record() {
    const calls: Array<[string, ...unknown[]]> = [];
    const q = {
        in: (...a: unknown[]) => (calls.push(['in', ...a]), q),
        lt: (...a: unknown[]) => (calls.push(['lt', ...a]), q),
    };
    return { q, calls };
}

describe('overdue invoice predicate (#1152)', () => {
    it('keeps open invoices due strictly before today', () => {
        const { q, calls } = record();
        applyOverdueFilter(q, '2026-10-25');
        expect(calls).toEqual([
            ['in', 'status', ['unpaid', 'partially_paid']],
            ['lt', 'due_date', '2026-10-25'],
        ]);
        // lt is strict: due yesterday matches, due today and tomorrow do not.
        const matches = (due: string) => due < '2026-10-25';
        expect(matches('2026-10-24')).toBe(true);
        expect(matches('2026-10-25')).toBe(false);
        expect(matches('2026-10-26')).toBe(false);
    });

    it('cuts off at the UTC calendar date', () => {
        expect(overdueCutoffDate(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
    });
});
