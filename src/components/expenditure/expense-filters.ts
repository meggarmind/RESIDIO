import type { ExpenseStatus } from '@/types/database';

export const EXPENSE_PAGE_SIZES = [10, 20, 50] as const;
const STATUSES: ExpenseStatus[] = ['pending', 'paid', 'cancelled'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ledger's filters and page, as carried in the /expenditure URL (#785). */
export interface ExpenseFilters {
    status?: ExpenseStatus;
    categoryId?: string;
    search?: string;
    page: number;
    pageSize: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

/** Reads the URL; anything unrecognised falls back to the unfiltered first page. */
export function parseExpenseFilters(params: SearchParams): ExpenseFilters {
    const status = first(params.status) as ExpenseStatus | undefined;
    const category = first(params.category);
    const search = first(params.q)?.trim();
    const page = Number(first(params.page));
    const size = Number(first(params.size));

    return {
        status: status && STATUSES.includes(status) ? status : undefined,
        categoryId: category && UUID.test(category) ? category : undefined,
        search: search || undefined,
        page: Number.isInteger(page) && page > 0 ? page : 1,
        pageSize: (EXPENSE_PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
    };
}

/** The query string for `filters`, leaving defaults out so the plain URL stays plain. */
export function expenseFiltersToQuery(filters: ExpenseFilters): string {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.categoryId) params.set('category', filters.categoryId);
    if (filters.search) params.set('q', filters.search);
    if (filters.page > 1) params.set('page', String(filters.page));
    if (filters.pageSize !== 20) params.set('size', String(filters.pageSize));
    const query = params.toString();
    return query ? `?${query}` : '';
}
