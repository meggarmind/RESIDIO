'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { fetchBudgetRows, fetchPaidSpendByCategory } from '@/lib/budgets/budget-data';
import { budgetRowId } from '@/lib/budgets/budget-row-id';
import {
    MAX_BUDGET_AMOUNT,
    MONTH_NAMES,
    categoryYearFromRows,
    monthPeriod,
    monthsDifference,
    sumAmounts,
} from '@/lib/budgets/budget-months';
import type { ExpenseCategoryColor } from '@/types/database';

// Budgets screen (#1406): one yearly amount per expense category, with an optional monthly split.
// Stored as 12 month rows per category-year in `budgets` (see `@/lib/budgets/budget-months`).

export interface BudgetCategoryYear {
    categoryId: string;
    name: string;
    color: ExpenseCategoryColor;
    isActive: boolean;
    /** Amount per month, January first. */
    months: number[];
    yearly: number;
    /** True when the category has any month row for the year. */
    hasBudget: boolean;
    /** Paid spend in the year, for the % used bar. */
    actual: number;
    /** Rows the screen cannot show as months (see `CategoryYear.irregularRowIds`); saving is refused. */
    hasIrregularRows: boolean;
}

export interface BudgetYear {
    year: number;
    categories: BudgetCategoryYear[];
}

const yearSchema = z.number().int().min(2000).max(2100);

/** The budgets and paid spend of every expense category for `year`. Needs EXPENDITURE_VIEW. */
export async function getBudgetYear(year: number): Promise<{ data: BudgetYear | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.EXPENDITURE_VIEW);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const parsedYear = yearSchema.safeParse(year);
    if (!parsedYear.success) return { data: null, error: 'Choose a year from 2000 to 2100' };

    const supabase = await createServerSupabaseClient();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    try {
        const [categoriesResult, rows, spend] = await Promise.all([
            supabase.from('expense_categories').select('id, name, color, is_active, sort_order').order('sort_order').order('name'),
            fetchBudgetRows(supabase, start, end),
            fetchPaidSpendByCategory(supabase, start, end),
        ]);
        if (categoriesResult.error) {
            console.error('Error fetching expense categories for budgets:', categoriesResult.error);
            return { data: null, error: 'Could not load the expense categories' };
        }

        const categories: BudgetCategoryYear[] = [];
        for (const category of categoriesResult.data ?? []) {
            const categoryYear = categoryYearFromRows(rows, category.id, year);
            // An inactive category is listed only when it already has a budget this year.
            if (!category.is_active && !categoryYear.hasRows && categoryYear.irregularRowIds.length === 0) continue;
            categories.push({
                categoryId: category.id,
                name: category.name,
                color: category.color,
                isActive: category.is_active,
                months: categoryYear.months,
                yearly: sumAmounts(categoryYear.months),
                hasBudget: categoryYear.hasRows,
                actual: spend.get(category.id) ?? 0,
                hasIrregularRows: categoryYear.irregularRowIds.length > 0,
            });
        }
        return { data: { year, categories }, error: null };
    } catch (error) {
        console.error('Error loading budget year:', error);
        return { data: null, error: 'Could not load budgets' };
    }
}

const amountSchema = z
    .number()
    .finite()
    .min(0, 'Amounts cannot be negative')
    .max(MAX_BUDGET_AMOUNT, 'Amount is too large')
    .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, 'Use at most 2 decimal places');

const saveBudgetYearSchema = z.object({
    year: yearSchema,
    categories: z
        .array(
            z.object({
                categoryId: z.guid(),
                yearly: amountSchema,
                months: z.array(amountSchema).length(12),
            })
        )
        .min(1, 'Nothing to save')
        .refine((items) => new Set(items.map((c) => c.categoryId)).size === items.length, 'A category is listed twice'),
});

export type SaveBudgetYearInput = z.input<typeof saveBudgetYearSchema>;

/**
 * Saves the 12 month rows of each category in `input` for the year. Needs EXPENDITURE_MANAGE.
 *
 * All rows of all categories go in ONE upsert request on the primary key. PostgREST runs a request
 * in one transaction, so the save is all or nothing: a year is never half saved. An existing month
 * keeps its row id (an update); a missing month gets `budgetRowId` (an insert).
 */
export async function saveBudgetYear(input: SaveBudgetYearInput): Promise<{ error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.EXPENDITURE_MANAGE);
    if (!auth.authorized) return { error: auth.error || 'Unauthorized' };

    const parsed = saveBudgetYearSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid budget' };
    const { year, categories } = parsed.data;

    for (const category of categories) {
        const difference = monthsDifference(category.months, category.yearly);
        if (difference !== 0) {
            return { error: 'The months of a category do not add up to its yearly amount. Fix them before you save.' };
        }
    }

    const supabase = await createServerSupabaseClient();
    const categoryIds = categories.map((c) => c.categoryId);

    let existingRows;
    let names: Map<string, string>;
    try {
        const [rows, categoriesResult] = await Promise.all([
            fetchBudgetRows(supabase, `${year}-01-01`, `${year}-12-31`, categoryIds),
            supabase.from('expense_categories').select('id, name').in('id', categoryIds),
        ]);
        if (categoriesResult.error) throw categoriesResult.error;
        existingRows = rows;
        names = new Map((categoriesResult.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    } catch (error) {
        console.error('Error reading budgets before save:', error);
        return { error: 'Could not save budgets' };
    }

    const missing = categoryIds.find((id) => !names.has(id));
    if (missing) return { error: 'An expense category was not found. Reload the page.' };

    const upserts = [];
    const changes: { categoryId: string; rowId: string; old: number[]; next: number[]; hadRows: boolean }[] = [];
    for (const category of categories) {
        const current = categoryYearFromRows(existingRows, category.categoryId, year);
        if (current.irregularRowIds.length > 0) {
            return {
                error: `${names.get(category.categoryId)} has budget rows for ${year} that are not single months. Nothing was saved.`,
            };
        }
        for (let month = 0; month < 12; month++) {
            const period = monthPeriod(year, month);
            upserts.push({
                id: current.rowIds[month] ?? budgetRowId(category.categoryId, period.start),
                category_id: category.categoryId,
                amount: category.months[month],
                period_start: period.start,
                period_end: period.end,
            });
        }
        changes.push({
            categoryId: category.categoryId,
            rowId: current.rowIds[0] ?? budgetRowId(category.categoryId, monthPeriod(year, 0).start),
            old: current.months,
            next: category.months,
            hadRows: current.hasRows,
        });
    }

    const { error } = await supabase.from('budgets').upsert(upserts, { onConflict: 'id' });
    if (error) {
        console.error('Error saving budgets:', error);
        return { error: 'Could not save budgets. Nothing was changed.' };
    }

    const monthMap = (months: number[]) => Object.fromEntries(MONTH_NAMES.map((name, i) => [name, months[i]]));
    for (const change of changes) {
        await logAudit({
            action: change.hadRows ? 'UPDATE' : 'CREATE',
            entityType: 'budgets',
            entityId: change.rowId,
            entityDisplay: `Budget ${year}: ${names.get(change.categoryId)}`,
            oldValues: change.hadRows ? { yearly: sumAmounts(change.old), months: monthMap(change.old) } : undefined,
            newValues: { yearly: sumAmounts(change.next), months: monthMap(change.next) },
            metadata: { category_id: change.categoryId, year },
        });
    }

    revalidatePath('/expenditure/budgets');
    return { error: null };
}
