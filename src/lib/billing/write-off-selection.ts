/**
 * Smart select for the dues write-off dialog (#1460, mockup option B). Pure functions over a
 * resident's open bills. A bill's unpaid balance is amount_due - amount_paid: that is what a
 * write-off removes.
 */

export type WriteOffBill = {
    id: string;
    period_start: string | null;
    amount_due: number;
    amount_paid: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The unpaid balance of one bill, never below zero. */
export function unpaidBalance(bill: WriteOffBill): number {
    return Math.max(0, round2(Number(bill.amount_due) - Number(bill.amount_paid)));
}

/** Bills oldest first by period_start (a bill without one goes last), then by id for a stable order. */
export function sortOldestFirst<T extends WriteOffBill>(bills: readonly T[]): T[] {
    return [...bills].sort((a, b) => {
        const pa = a.period_start ?? '9999-12-31';
        const pb = b.period_start ?? '9999-12-31';
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * The oldest bills whose balances add up to at most `target`, stopping at the first bill that does
 * not fit. `exact` is true when they add up to `target`; `gap` is what is left of the target.
 */
export function selectOldestUpTo(bills: readonly WriteOffBill[], target: number): { ids: string[]; total: number; exact: boolean; gap: number } {
    const ids: string[] = [];
    let total = 0;
    for (const bill of sortOldestFirst(bills)) {
        const balance = unpaidBalance(bill);
        if (round2(total + balance) > target) break;
        total = round2(total + balance);
        ids.push(bill.id);
    }
    const gap = round2(target - total);
    return { ids, total, exact: gap === 0, gap };
}

/**
 * Keep the newest bills a payment fully covers and select every other bill. Walks newest first; a
 * bill the rest of the payment cannot cover is selected, and the walk goes on to older bills.
 */
export function selectAllButNewestCoveredBy(bills: readonly WriteOffBill[], payment: number): string[] {
    const selected: string[] = [];
    let left = payment;
    for (const bill of sortOldestFirst(bills).reverse()) {
        const balance = unpaidBalance(bill);
        if (left >= balance) {
            left = round2(left - balance);
        } else {
            selected.push(bill.id);
        }
    }
    return selected.reverse();
}

/** The bills of one calendar year, by period_start. */
export function selectYear(bills: readonly WriteOffBill[], year: number): string[] {
    const prefix = `${year}-`;
    return sortOldestFirst(bills)
        .filter((bill) => bill.period_start?.startsWith(prefix))
        .map((bill) => bill.id);
}

/**
 * Totals for the sticky bar: how many bills are selected, their balance, and what the resident
 * still owes on these bills after the write-off and the optional payment (never below zero).
 */
export function summarize(
    bills: readonly WriteOffBill[],
    selectedIds: Iterable<string>,
    paymentAmount?: number,
): { count: number; total: number; owedAfter: number } {
    const selected = new Set(selectedIds);
    let total = 0;
    let open = 0;
    let count = 0;
    for (const bill of bills) {
        const balance = unpaidBalance(bill);
        open = round2(open + balance);
        if (selected.has(bill.id)) {
            count += 1;
            total = round2(total + balance);
        }
    }
    const owedAfter = Math.max(0, round2(open - total - (paymentAmount && paymentAmount > 0 ? paymentAmount : 0)));
    return { count, total, owedAfter };
}
