/**
 * "Budget against actual" report (#1406), summary-first layout B (#1397): per expense category the
 * budget for the period, the actual paid spend, the difference and the % used.
 *
 * No authorization here (see the header of `report-generator.ts`): the callers check
 * REPORTS_VIEW_FINANCIAL first, and the generator switch passes the service-role client, because
 * `budgets`, `expenses` and `expense_categories` are readable through RLS only with view_expenditure,
 * a permission a role that runs this report need not hold.
 */

import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryCell, SummaryReport, SummaryReportData, SummaryTone } from '@/lib/reports/summary-report';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { fetchBudgetRows, fetchPaidSpendByCategory } from '@/lib/budgets/budget-data';
import { BUDGET_STATUS_LABELS, budgetStatus, fromCents, percentUsed, toCents, type BudgetStatus } from '@/lib/budgets/budget-months';
import { formatCalendarDate } from '@/lib/utils/calendar-date';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const money = (amount: number) => amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedMoney = (amount: number) => (amount < 0 ? `-${money(Math.abs(amount))}` : money(amount));
const longDate = (value: string) => formatCalendarDate(value, 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const percent = (value: number) => `${value.toFixed(1)}%`;

const STATUS_TONE: Record<BudgetStatus, SummaryTone> = {
    no_budget: 'neutral',
    on_track: 'good',
    near_limit: 'neutral',
    over_budget: 'bad',
};

/**
 * The part of each budget row that falls inside `start`..`end`, by days: a whole month in the period
 * counts in full, a month cut by the period counts for its days in it. Returned in kobo per category.
 */
export function proratedBudgetCents(
    rows: { category_id: string | null; amount: number | string; period_start: string; period_end: string }[],
    start: string,
    end: string
): Map<string | null, number> {
    const from = dayNumber(start);
    const to = dayNumber(end);
    const totals = new Map<string | null, number>();
    for (const row of rows) {
        const rowStart = dayNumber(row.period_start);
        const rowEnd = dayNumber(row.period_end);
        const overlap = Math.min(to, rowEnd) - Math.max(from, rowStart) + 1;
        if (overlap <= 0) continue;
        const share = (toCents(Number(row.amount) || 0) * overlap) / (rowEnd - rowStart + 1);
        totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + share);
    }
    return new Map([...totals].map(([key, cents]) => [key, Math.round(cents)]));
}

export async function generateBudgetVsActual(
    client: ReportSupabaseClient,
    dateRange: { startDate: string; endDate: string }
): Promise<SummaryReport> {
    const { startDate, endDate } = dateRange;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
        throw new Error('Choose a start and end date for the period');
    }

    const [categoriesResult, budgetRows, spend] = await Promise.all([
        fetchAllRows<{ id: string; name: string; sort_order: number | null }>((from, to) =>
            client.from('expense_categories').select('id, name, sort_order').order('id').range(from, to)
        ),
        fetchBudgetRows(client, startDate, endDate),
        fetchPaidSpendByCategory(client, startDate, endDate),
    ]);
    if (categoriesResult.error !== null) {
        console.error('Error fetching expense categories for budget report:', categoriesResult.error);
        throw new Error('Failed to load expense categories');
    }

    const budgetCents = proratedBudgetCents(budgetRows, startDate, endDate);
    const categories = [...categoriesResult.data].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
    );

    interface Line { name: string; budget: number; actual: number }
    const lines: Line[] = [];
    for (const category of categories) {
        const budget = fromCents(budgetCents.get(category.id) ?? 0);
        const actual = spend.get(category.id) ?? 0;
        if (budget > 0 || actual > 0) lines.push({ name: category.name, budget, actual });
    }
    // Paid expenses with no category have no budget; they still count in the actual total.
    const uncategorised = spend.get(null) ?? 0;
    if (uncategorised > 0) lines.push({ name: 'No category', budget: 0, actual: uncategorised });

    const totalBudget = fromCents(lines.reduce((sum, l) => sum + toCents(l.budget), 0));
    const totalActual = fromCents(lines.reduce((sum, l) => sum + toCents(l.actual), 0));
    const totalDifference = fromCents(toCents(totalBudget) - toCents(totalActual));
    const totalStatus = budgetStatus(totalActual, totalBudget);

    const rows: Record<string, SummaryCell>[] = lines.map((line) => {
        const status = budgetStatus(line.actual, line.budget);
        return {
            category: line.name,
            budget: money(line.budget),
            actual: money(line.actual),
            difference: signedMoney(fromCents(toCents(line.budget) - toCents(line.actual))),
            used: line.budget > 0 ? percent(percentUsed(line.actual, line.budget)) : '-',
            status: BUDGET_STATUS_LABELS[status],
        };
    });

    const budgeted = lines.filter((line) => line.budget > 0);
    const data: SummaryReportData = {
        summary: [
            { label: 'Total budget (NGN)', value: money(totalBudget), tone: 'neutral' },
            { label: 'Actual spend (NGN)', value: money(totalActual), tone: 'neutral' },
            { label: 'Difference (NGN)', value: signedMoney(totalDifference), tone: totalDifference < 0 ? 'bad' : 'good' },
            {
                label: '% used',
                value: totalBudget > 0 ? percent(percentUsed(totalActual, totalBudget)) : '-',
                tone: STATUS_TONE[totalStatus],
                hint: BUDGET_STATUS_LABELS[totalStatus],
            },
        ],
        chart: {
            title: '% of budget used by category',
            bars: budgeted.map((line) => {
                const used = percentUsed(line.actual, line.budget);
                return { label: line.name, value: used, display: percent(used), tone: STATUS_TONE[budgetStatus(line.actual, line.budget)] };
            }),
        },
        table: {
            columns: [
                { key: 'category', label: 'Category' },
                { key: 'budget', label: 'Budget', align: 'right' },
                { key: 'actual', label: 'Actual', align: 'right' },
                { key: 'difference', label: 'Difference', align: 'right' },
                { key: 'used', label: '% used', align: 'right' },
                { key: 'status', label: 'Status' },
            ],
            rows,
            totals: {
                category: 'Total',
                budget: money(totalBudget),
                actual: money(totalActual),
                difference: signedMoney(totalDifference),
                used: totalBudget > 0 ? percent(percentUsed(totalActual, totalBudget)) : '-',
                status: BUDGET_STATUS_LABELS[totalStatus],
            },
        },
        notes: [
            `Period: ${longDate(startDate)} to ${longDate(endDate)}.`,
            'Budget is the monthly budget of each category for the months in the period. A month the period covers only in part counts for its days in the period.',
            'Actual is expenses marked paid with an expense date in the period. Difference is budget minus actual; a minus sign means over budget.',
            'Status: On track below 85% used, Near limit from 85% to 100%, Over budget above 100%, No budget when the category has no budget for the period.',
        ],
    };

    return { type: 'budget_vs_actual', layout: 'summary', data };
}
