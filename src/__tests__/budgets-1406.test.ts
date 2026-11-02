// #1406: Budgets per expense category (owner pick: option C, yearly amount with an optional monthly
// split) and the "Budget against actual" report.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authorizePermission: vi.fn(),
    createServerSupabaseClient: vi.fn(),
    createAdminClient: vi.fn(),
    logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: mocks.createServerSupabaseClient,
    createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
    budgetStatus,
    categoryYearFromRows,
    evenSplit,
    monthPeriod,
    monthSplitStatus,
    monthsDifference,
    percentUsed,
    sumAmounts,
} from '@/lib/budgets/budget-months';
import { budgetRowId } from '@/lib/budgets/budget-row-id';
import { getBudgetYear, saveBudgetYear } from '@/actions/expenses/budgets';
import { generateBudgetVsActual, proratedBudgetCents } from '@/lib/reports/generators/budget-vs-actual';
import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import {
    GENERATABLE_REPORT_TYPES,
    REPORT_TYPE_LABELS,
    getReportPermission,
    reportRequestSchema,
    reportTypes,
} from '@/lib/validators/reports';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { AUDIT_ENTITY_LABELS } from '@/types/database';
import { ADMIN_NAV_SECTIONS } from '@/config/navigation';

// ---------------------------------------------------------------------------
// A fake Supabase client that applies the filters, caps an unpaged read at 1,000 rows like the API,
// and records ranges and upserts.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
const API_ROW_CAP = 1000;

function fakeDb(tables: Record<string, Row[]>) {
    const calls = {
        from: [] as string[],
        ranges: [] as { table: string; from: number; to: number }[],
        upserts: [] as { table: string; rows: Row[]; options: unknown }[],
    };
    let upsertError: { message: string } | null = null;

    function builder(table: string) {
        const filters: ((r: Row) => boolean)[] = [];
        const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        const b: Record<string, unknown> = {};
        b.select = () => b;
        b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b);
        b.neq = (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b);
        b.gte = (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b);
        b.lte = (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), b);
        b.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b);
        b.order = () => b;
        b.range = (from: number, to: number) => {
            calls.ranges.push({ table, from, to });
            return Promise.resolve({ data: rows().slice(from, Math.min(to + 1, from + API_ROW_CAP)), error: null });
        };
        b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows().slice(0, API_ROW_CAP), error: null }).then(resolve, reject);
        b.upsert = (upsertRows: Row[], options: unknown) => {
            calls.upserts.push({ table, rows: upsertRows, options });
            return Promise.resolve({ error: upsertError });
        };
        return b;
    }

    return {
        client: { from: (t: string) => (calls.from.push(t), builder(t)) } as never,
        calls,
        failUpsert: (e: { message: string }) => (upsertError = e),
    };
}

const CAT_A = '11111111-1111-4111-8111-111111111111';
const CAT_B = '22222222-2222-4222-8222-222222222222';
const CAT_OLD = '33333333-3333-4333-8333-333333333333';
const category = (id: string, name: string, sort = 0, active = true) => ({ id, name, color: 'blue', is_active: active, sort_order: sort });
const monthRow = (id: string, categoryId: string, year: number, monthIndex: number, amount: number) => ({
    id, category_id: categoryId, amount, period_start: monthPeriod(year, monthIndex).start, period_end: monthPeriod(year, monthIndex).end,
});
const yearRows = (categoryId: string, year: number, months: number[], prefix = 'r') =>
    months.map((amount, i) => monthRow(`${prefix}-${categoryId.slice(0, 1)}-${i}`, categoryId, year, i, amount));
const expense = (id: string, categoryId: string | null, date: string, amount: number, status = 'paid', source_type = 'manual') =>
    ({ id, category_id: categoryId, expense_date: date, amount, status, source_type });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
});

// ---------------------------------------------------------------------------
describe('Month split arithmetic', () => {
    it('splits a year into 11 equal months and puts the remainder in December', () => {
        const months = evenSplit(1000);
        expect(months.slice(0, 11)).toEqual(Array(11).fill(83.33));
        expect(months[11]).toBe(83.37);
        expect(sumAmounts(months)).toBe(1000);
        expect(evenSplit(1_200_000)).toEqual(Array(12).fill(100_000));
        expect(sumAmounts(evenSplit(0.11))).toBe(0.11);
    });

    it('names the split: even, custom or months that do not add up', () => {
        expect(monthSplitStatus(evenSplit(1000), 1000)).toBe('even');
        const custom = [...evenSplit(1200)];
        custom[0] += 10;
        custom[1] -= 10;
        expect(monthSplitStatus(custom, 1200)).toBe('custom');
        custom[2] += 5;
        expect(monthSplitStatus(custom, 1200)).toBe('mismatch');
        expect(monthsDifference(custom, 1200)).toBe(5);
        expect(monthsDifference(evenSplit(1200), 1300)).toBe(-100);
    });

    it('reads month rows of one category and year, and flags rows that are not single months', () => {
        const rows = [
            ...yearRows(CAT_A, 2026, evenSplit(1200)),
            monthRow('other-year', CAT_A, 2025, 0, 999),
            monthRow('other-cat', CAT_B, 2026, 0, 999),
            { id: 'quarter', category_id: CAT_A, amount: 50, period_start: '2026-01-01', period_end: '2026-03-31' },
            monthRow('dup-june', CAT_A, 2026, 5, 7),
        ];
        const result = categoryYearFromRows(rows, CAT_A, 2026);
        expect(result.months).toEqual(evenSplit(1200));
        expect(result.hasRows).toBe(true);
        expect(result.rowIds[0]).toBe('r-1-0');
        expect(result.irregularRowIds.sort()).toEqual(['dup-june', 'quarter']);
        expect(categoryYearFromRows([], CAT_A, 2026)).toMatchObject({ hasRows: false, months: Array(12).fill(0) });
    });

    it('gives month bounds with the right last day and no time zone shift', () => {
        expect(monthPeriod(2026, 0)).toEqual({ start: '2026-01-01', end: '2026-01-31' });
        expect(monthPeriod(2028, 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
        expect(monthPeriod(2026, 11)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    });

    it('sets the status at 85% and above 100%', () => {
        expect(budgetStatus(0, 0)).toBe('no_budget');
        expect(budgetStatus(50, 0)).toBe('no_budget');
        expect(budgetStatus(84.99, 100)).toBe('on_track');
        expect(budgetStatus(85, 100)).toBe('near_limit');
        expect(budgetStatus(100, 100)).toBe('near_limit');
        expect(budgetStatus(100.01, 100)).toBe('over_budget');
        expect(percentUsed(115, 100)).toBe(115);
        expect(percentUsed(5, 0)).toBe(0);
    });

    it('makes the same valid UUID for the same category and month, and a different one per month', () => {
        const a = budgetRowId(CAT_A, '2026-01-01');
        expect(a).toBe(budgetRowId(CAT_A, '2026-01-01'));
        expect(a).not.toBe(budgetRowId(CAT_A, '2026-02-01'));
        expect(a).not.toBe(budgetRowId(CAT_B, '2026-01-01'));
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});

// ---------------------------------------------------------------------------
describe('getBudgetYear', () => {
    it('needs EXPENDITURE_VIEW and returns the refusal without reading', async () => {
        mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: no' });
        expect(await getBudgetYear(2026)).toEqual({ data: null, error: 'Unauthorized: no' });
        expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.EXPENDITURE_VIEW);
        expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it('returns each category with its months, yearly sum and paid spend for the year', async () => {
        const custom = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300];
        const db = fakeDb({
            expense_categories: [category(CAT_A, 'Security'), category(CAT_B, 'Water', 1), category(CAT_OLD, 'Old', 2, false)],
            budgets: [...yearRows(CAT_A, 2026, custom), ...yearRows(CAT_A, 2025, evenSplit(9999), 'y25')],
            expenses: [
                expense('e1', CAT_A, '2026-03-04', 250),
                expense('e2', CAT_A, '2026-05-04', 50, 'pending'),
                expense('e3', CAT_A, '2025-12-31', 70),
                expense('e4', CAT_A, '2026-07-01', 30, 'paid', 'bank_import'),
            ],
        });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const { data, error } = await getBudgetYear(2026);
        expect(error).toBeNull();
        expect(data!.categories.map((c) => c.name)).toEqual(['Security', 'Water']); // inactive, no budget: left out
        expect(data!.categories[0]).toMatchObject({ months: custom, yearly: 1400, hasBudget: true, actual: 280, hasIrregularRows: false });
        expect(data!.categories[1]).toMatchObject({ yearly: 0, hasBudget: false, actual: 0 });
    });

    it('reads every budget and expense row, past the 1,000-row cap', async () => {
        const many = Array.from({ length: 1500 }, (_, i) => expense(`e${String(i).padStart(4, '0')}`, CAT_A, '2026-02-02', 1));
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security')], budgets: [], expenses: many });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const { data } = await getBudgetYear(2026);
        expect(data!.categories[0].actual).toBe(1500);
        expect(db.calls.ranges.filter((r) => r.table === 'expenses').length).toBeGreaterThan(1);
    });

    it('shows a load error instead of an empty list', async () => {
        mocks.createServerSupabaseClient.mockResolvedValue({
            from: () => {
                const b: Record<string, unknown> = {};
                for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'order']) b[m] = () => b;
                b.range = () => Promise.resolve({ data: null, error: { message: 'permission denied' } });
                b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(res);
                return b;
            },
        });
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await getBudgetYear(2026);
        spy.mockRestore();
        expect(result.data).toBeNull();
        expect(result.error).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
describe('saveBudgetYear', () => {
    const input = (months: number[], yearly = sumAmounts(months), categoryId = CAT_A) => ({ year: 2026, categories: [{ categoryId, yearly, months }] });

    it('needs EXPENDITURE_MANAGE, checked before any read', async () => {
        mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: manage' });
        expect(await saveBudgetYear(input(evenSplit(1200)))).toEqual({ error: 'Unauthorized: manage' });
        expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.EXPENDITURE_MANAGE);
        expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
        expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('refuses months that do not add up to the year, and writes nothing', async () => {
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security')], budgets: [] });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const result = await saveBudgetYear(input(evenSplit(1200), 1300));
        expect(result.error).toMatch(/do not add up/);
        expect(db.calls.upserts).toEqual([]);
        expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('refuses negative amounts, a wrong month count and a listed-twice category', async () => {
        expect((await saveBudgetYear(input([-1, ...Array(11).fill(0)]))).error).toBeTruthy();
        expect((await saveBudgetYear({ year: 2026, categories: [{ categoryId: CAT_A, yearly: 0, months: Array(11).fill(0) }] })).error).toBeTruthy();
        const twice = { year: 2026, categories: [input(evenSplit(12)).categories[0], input(evenSplit(12)).categories[0]] };
        expect((await saveBudgetYear(twice)).error).toBe('A category is listed twice');
        expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it('writes 12 month rows per category in ONE upsert on id: existing months keep their id, new months get the fixed id', async () => {
        const existing = yearRows(CAT_A, 2026, evenSplit(1200)).slice(0, 6); // January to June saved before
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security'), category(CAT_B, 'Water')], budgets: existing });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const months = [100, 100, 100, 100, 100, 100, 200, 200, 200, 200, 200, 200];
        const result = await saveBudgetYear({
            year: 2026,
            categories: [
                { categoryId: CAT_A, yearly: 1800, months },
                { categoryId: CAT_B, yearly: 1000, months: evenSplit(1000) },
            ],
        });
        expect(result).toEqual({ error: null });
        expect(db.calls.upserts).toHaveLength(1);
        const [{ table, rows, options }] = db.calls.upserts;
        expect(table).toBe('budgets');
        expect(options).toEqual({ onConflict: 'id' });
        expect(rows).toHaveLength(24);
        const a = rows.filter((r) => r.category_id === CAT_A);
        expect(a.map((r) => r.amount)).toEqual(months);
        expect(a.slice(0, 6).map((r) => r.id)).toEqual(existing.map((r) => r.id));
        expect(a[6].id).toBe(budgetRowId(CAT_A, '2026-07-01'));
        expect(a[1]).toMatchObject({ period_start: '2026-02-01', period_end: '2026-02-28' });
        const b = rows.filter((r) => r.category_id === CAT_B);
        expect(b.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => budgetRowId(CAT_B, monthPeriod(2026, i).start)));
    });

    it('audits each category after the save, as budgets, with old and new months', async () => {
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security')], budgets: yearRows(CAT_A, 2026, evenSplit(1200)) });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        await saveBudgetYear(input(evenSplit(2400)));
        expect(mocks.logAudit).toHaveBeenCalledTimes(1);
        const entry = mocks.logAudit.mock.calls[0][0];
        expect(entry).toMatchObject({ action: 'UPDATE', entityType: 'budgets', entityId: 'r-1-0', entityDisplay: 'Budget 2026: Security' });
        expect(entry.oldValues).toMatchObject({ yearly: 1200, months: { January: 100 } });
        expect(entry.newValues).toMatchObject({ yearly: 2400, months: { January: 200, December: 200 } });
        expect(entry.metadata).toEqual({ category_id: CAT_A, year: 2026 });
        expect(AUDIT_ENTITY_LABELS.budgets).toBe('Budget');
    });

    it('a first save is a CREATE audited on the January row', async () => {
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security')], budgets: [] });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        await saveBudgetYear(input(evenSplit(1200)));
        expect(mocks.logAudit.mock.calls[0][0]).toMatchObject({ action: 'CREATE', entityId: budgetRowId(CAT_A, '2026-01-01'), oldValues: undefined });
    });

    it('a failed upsert returns an error and audits nothing', async () => {
        const db = fakeDb({ expense_categories: [category(CAT_A, 'Security')], budgets: [] });
        db.failUpsert({ message: 'boom' });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await saveBudgetYear(input(evenSplit(1200)));
        spy.mockRestore();
        expect(result.error).toMatch(/Nothing was changed/);
        expect(mocks.logAudit).not.toHaveBeenCalled();
    });

    it('refuses a category with rows that are not single months, and writes nothing', async () => {
        const db = fakeDb({
            expense_categories: [category(CAT_A, 'Security')],
            budgets: [{ id: 'q1', category_id: CAT_A, amount: 300, period_start: '2026-01-01', period_end: '2026-03-31' }],
        });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        const result = await saveBudgetYear(input(evenSplit(1200)));
        expect(result.error).toMatch(/Security has budget rows for 2026 that are not single months/);
        expect(db.calls.upserts).toEqual([]);
    });

    it('refuses an unknown category', async () => {
        const db = fakeDb({ expense_categories: [], budgets: [] });
        mocks.createServerSupabaseClient.mockResolvedValue(db.client);
        expect((await saveBudgetYear(input(evenSplit(1200)))).error).toMatch(/not found/);
        expect(db.calls.upserts).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
describe('Budget against actual report', () => {
    const range = { startDate: '2026-01-01', endDate: '2026-12-31' };
    const run = async (tables: Record<string, Row[]>, r = range) => (await generateBudgetVsActual(fakeDb(tables).client, r)).data;

    // Security: budget 1,200, paid 600 (50%). Water: budget 1,000, paid 900 (90%). Repairs: budget 100,
    // paid 150 (150%). Fuel: no budget, paid 40. Plus 10 paid with no category.
    const TABLES = {
        expense_categories: [category(CAT_A, 'Security', 0), category(CAT_B, 'Water', 1), category('c3', 'Repairs', 2), category('c4', 'Fuel', 3), category('c5', 'Unused', 4)],
        budgets: [...yearRows(CAT_A, 2026, evenSplit(1200)), ...yearRows(CAT_B, 2026, evenSplit(1000), 'w'), ...yearRows('c3', 2026, evenSplit(100), 'p'), ...yearRows(CAT_A, 2025, evenSplit(5000), 'old')],
        expenses: [
            expense('x1', CAT_A, '2026-02-01', 600),
            expense('x2', CAT_B, '2026-06-01', 900),
            expense('x3', 'c3', '2026-06-01', 150),
            expense('x4', 'c4', '2026-06-01', 40),
            expense('x5', null, '2026-06-01', 10),
            expense('x6', CAT_A, '2026-06-01', 999, 'pending'),
            expense('x7', CAT_A, '2027-01-01', 999),
        ],
    };

    it('is registered: Money in and out, REPORTS_VIEW_FINANCIAL, generatable, summary layout', async () => {
        const entry = reportTypes.find((t) => t.value === 'budget_vs_actual');
        expect(entry).toMatchObject({ label: 'Budget against actual', group: 'Money in and out' });
        expect(getReportPermission('budget_vs_actual')).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
        expect(GENERATABLE_REPORT_TYPES).toContain('budget_vs_actual');
        expect(REPORT_TYPE_LABELS.budget_vs_actual).toBe('Budget against actual');
    });

    it('shows the four tiles', async () => {
        const data = await run(TABLES);
        expect(data.summary.map((t) => [t.label, t.value])).toEqual([
            ['Total budget (NGN)', '2,300.00'],
            ['Actual spend (NGN)', '1,700.00'],
            ['Difference (NGN)', '600.00'],
            ['% used', '73.9%'],
        ]);
        expect(data.summary[2].tone).toBe('good');
    });

    it('has one row per category with a budget or spend, with difference, % used and status', async () => {
        const data = await run(TABLES);
        expect(data.table.rows).toEqual([
            { category: 'Security', budget: '1,200.00', actual: '600.00', difference: '600.00', used: '50.0%', status: 'On track' },
            { category: 'Water', budget: '1,000.00', actual: '900.00', difference: '100.00', used: '90.0%', status: 'Near limit' },
            { category: 'Repairs', budget: '100.00', actual: '150.00', difference: '-50.00', used: '150.0%', status: 'Over budget' },
            { category: 'Fuel', budget: '0.00', actual: '40.00', difference: '-40.00', used: '-', status: 'No budget' },
            { category: 'No category', budget: '0.00', actual: '10.00', difference: '-10.00', used: '-', status: 'No budget' },
        ]);
        expect(data.table.totals).toEqual({ category: 'Total', budget: '2,300.00', actual: '1,700.00', difference: '600.00', used: '73.9%', status: 'On track' });
    });

    it('charts % used for each category with a budget', async () => {
        const data = await run(TABLES);
        expect(data.chart!.bars.map((b) => [b.label, b.value, b.display, b.tone])).toEqual([
            ['Security', 50, '50.0%', 'good'],
            ['Water', 90, '90.0%', 'neutral'],
            ['Repairs', 150, '150.0%', 'bad'],
        ]);
    });

    it('pro-rates the budget by the days of each month in the period', async () => {
        // March 2026 has 31 days: 1 to 15 March is 15/31 of March's 310.
        const data = await run({ ...TABLES, budgets: yearRows(CAT_A, 2026, Array(12).fill(310)) }, { startDate: '2026-02-01', endDate: '2026-03-15' });
        expect(data.table.rows[0]).toMatchObject({ category: 'Security', budget: '460.00' });
        expect(proratedBudgetCents([{ category_id: 'a', amount: 300, period_start: '2026-01-01', period_end: '2026-03-31' }], '2026-02-01', '2026-02-28').get('a')).toBe(9333);
    });

    it('is empty with no budgets and no spend, and says the period with month names', async () => {
        const data = await run({ expense_categories: [category(CAT_A, 'Security')], budgets: [], expenses: [] });
        expect(data.table.rows).toEqual([]);
        expect(data.chart!.bars).toEqual([]);
        expect(data.summary.map((t) => t.value)).toEqual(['0.00', '0.00', '0.00', '-']);
        expect(data.notes![0]).toBe('Period: 1 January 2026 to 31 December 2026.');
    });

    it('reads past the 1,000-row cap for budgets and expenses', async () => {
        const many = Array.from({ length: 2500 }, (_, i) => expense(`e${String(i).padStart(5, '0')}`, CAT_A, '2026-05-05', 1));
        const manyBudgets = Array.from({ length: 1200 }, (_, i) => ({ id: `b${String(i).padStart(5, '0')}`, category_id: CAT_A, amount: 1, period_start: '2026-05-01', period_end: '2026-05-31' }));
        const data = await run({ expense_categories: [category(CAT_A, 'Security')], budgets: manyBudgets, expenses: many });
        expect(data.table.rows[0]).toMatchObject({ budget: '1,200.00', actual: '2,500.00' });
    });

    it('runs through the generator with the service-role client, not the caller session client', async () => {
        const admin = fakeDb(TABLES);
        const session = fakeDb(TABLES);
        mocks.createAdminClient.mockReturnValue(admin.client);
        const params = reportRequestSchema.parse({ reportType: 'budget_vs_actual', periodPreset: 'custom', startDate: '2026-01-01', endDate: '2026-12-31' });
        const result = await generateReportWithClient(session.client, params);
        expect(result.success).toBe(true);
        expect(isSummaryReport(result.report)).toBe(true);
        expect(result.report).toMatchObject({ type: 'budget_vs_actual', layout: 'summary' });
        expect((result.report!.data as SummaryReportData).summary[0].value).toBe('2,300.00');
        expect(admin.calls.from).toEqual(expect.arrayContaining(['budgets', 'expenses', 'expense_categories']));
        expect(session.calls.from).toEqual([]);
    });

    it('renders a server PDF with the summary layout', async () => {
        const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
        const buffer = await renderReportPdf('budget_vs_actual', await run(TABLES), 'Test Estate');
        expect(buffer).not.toBeNull();
        expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('fails with a message when a custom period has no dates', async () => {
        mocks.createAdminClient.mockReturnValue(fakeDb(TABLES).client);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const params = reportRequestSchema.parse({ reportType: 'budget_vs_actual', periodPreset: 'custom' });
        const result = await generateReportWithClient(fakeDb(TABLES).client, params);
        spy.mockRestore();
        expect(result).toEqual({ success: false, error: 'Choose a start and end date for the period' });
    });
});

// ---------------------------------------------------------------------------
describe('Budgets route and menu', () => {
    it('the page needs EXPENDITURE_VIEW and sits under Expenditure in the menu', () => {
        expect(ROUTE_PERMISSIONS['/expenditure/budgets']).toEqual([PERMISSIONS.EXPENDITURE_VIEW]);
        const expenditure = ADMIN_NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === 'expenditure');
        expect(expenditure?.children?.find((c) => c.href === '/expenditure/budgets')?.permissions).toEqual([PERMISSIONS.EXPENDITURE_VIEW]);
    });
});
