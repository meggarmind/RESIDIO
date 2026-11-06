/**
 * Budgets per expense category (#1406, owner pick: mockup option C, "Yearly amount with optional
 * monthly split"). A category-year is stored as 12 `budgets` rows, one per calendar month
 * (`period_start` = first day, `period_end` = last day). The yearly amount is their sum. "Even split"
 * and "custom months" are not stored: they are read by comparing the months to `evenSplit(year)`.
 *
 * All sums are done in whole kobo (integer cents) so that 12 months always add up exactly.
 * Pure functions only: the screen and the server actions share them.
 */

export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Largest value of `budgets.amount` (DECIMAL(15, 2)). */
export const MAX_BUDGET_AMOUNT = 9_999_999_999_999.99;

export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

/** Sum of amounts, exact to the kobo. */
export function sumAmounts(amounts: readonly number[]): number {
    return fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0));
}

/**
 * The yearly amount split into 12 months: 11 equal months rounded down to the kobo, and December
 * takes the remainder, so the months always add up to the year.
 */
export function evenSplit(yearly: number): number[] {
    const cents = Math.max(0, toCents(yearly));
    const base = Math.floor(cents / 12);
    return [...Array(11).fill(fromCents(base)), fromCents(cents - base * 11)];
}

/** True when `months` is exactly the even split of their own total. */
export function isEvenSplit(months: readonly number[]): boolean {
    const even = evenSplit(sumAmounts(months));
    return months.length === 12 && months.every((amount, i) => toCents(amount) === toCents(even[i]));
}

/** Months total minus the yearly amount, in naira (positive: the months are too high). */
export function monthsDifference(months: readonly number[], yearly: number): number {
    return fromCents(toCents(sumAmounts(months)) - toCents(yearly));
}

export type MonthSplitStatus = 'even' | 'custom' | 'mismatch';

/** The status pill of a category: Even split, Custom months, or Months do not add up. */
export function monthSplitStatus(months: readonly number[], yearly: number): MonthSplitStatus {
    if (monthsDifference(months, yearly) !== 0) return 'mismatch';
    return isEvenSplit(months) ? 'even' : 'custom';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** First and last day ('YYYY-MM-DD') of month `monthIndex` (0-11) of `year`, with no time zone. */
export function monthPeriod(year: number, monthIndex: number): { start: string; end: string } {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return {
        start: `${year}-${pad(monthIndex + 1)}-01`,
        end: `${year}-${pad(monthIndex + 1)}-${pad(lastDay)}`,
    };
}

export interface BudgetRow {
    id: string;
    category_id: string | null;
    amount: number | string;
    period_start: string;
    period_end: string;
}

export interface CategoryYear {
    /** Amount per month, January first. A month with no row is 0. */
    months: number[];
    /** The row id of each month that has one, January first. */
    rowIds: (string | null)[];
    /** True when at least one month has a row. */
    hasRows: boolean;
    /**
     * Rows of this category that overlap the year but are not exactly one calendar month, or a
     * second row for the same month. The screen cannot show them as months, and saving must not
     * leave them beside the 12 month rows (the yearly sum would be wrong).
     */
    irregularRowIds: string[];
}

/** Reads one category's rows into the 12 months of `year`. `rows` may hold other years and categories. */
export function categoryYearFromRows(rows: readonly BudgetRow[], categoryId: string, year: number): CategoryYear {
    const months = Array<number>(12).fill(0);
    const rowIds = Array<string | null>(12).fill(null);
    const irregularRowIds: string[] = [];
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    for (const row of rows) {
        if (row.category_id !== categoryId) continue;
        if (row.period_end < yearStart || row.period_start > yearEnd) continue;
        const monthIndex = Number(row.period_start.slice(5, 7)) - 1;
        const isMonth =
            row.period_start.slice(0, 4) === String(year) &&
            monthIndex >= 0 && monthIndex < 12 &&
            row.period_start === monthPeriod(year, monthIndex).start &&
            row.period_end === monthPeriod(year, monthIndex).end;
        if (!isMonth || rowIds[monthIndex] !== null) {
            irregularRowIds.push(row.id);
            continue;
        }
        months[monthIndex] = Number(row.amount) || 0;
        rowIds[monthIndex] = row.id;
    }

    return { months, rowIds, hasRows: rowIds.some((id) => id !== null), irregularRowIds };
}

/** Percent of `budget` that `actual` uses, to one decimal; 0 when there is no budget. */
export function percentUsed(actual: number, budget: number): number {
    return budget > 0 ? Math.round((actual / budget) * 1000) / 10 : 0;
}

export type BudgetStatus = 'no_budget' | 'on_track' | 'near_limit' | 'over_budget';

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
    no_budget: 'No budget',
    on_track: 'On track',
    near_limit: 'Near limit',
    over_budget: 'Over budget',
};

/** Over budget above 100% used, Near limit from 85%, On track below; No budget when the budget is 0. */
export function budgetStatus(actual: number, budget: number): BudgetStatus {
    const budgetCents = toCents(budget);
    const actualCents = toCents(actual);
    if (budgetCents <= 0) return 'no_budget';
    if (actualCents > budgetCents) return 'over_budget';
    if (actualCents * 100 >= budgetCents * 85) return 'near_limit';
    return 'on_track';
}
