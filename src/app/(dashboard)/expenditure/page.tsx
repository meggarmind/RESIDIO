import { getExpenses } from '@/actions/expenses/get-expenses';
import { getVendors } from '@/actions/vendors/get-vendors';
import { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
import { getProjects } from '@/actions/projects/get-projects';
import { getPettyCashMetrics, getPettyCashAccounts } from '@/actions/finance/petty-cash';
import { ExpenditurePageClient } from '@/components/expenditure/expenditure-page-client';
import { redirect } from 'next/navigation';
import { expenseFiltersToQuery, parseExpenseFilters } from '@/components/expenditure/expense-filters';

/** One failed read degrades its own section instead of blanking the page (#785). */
function orFallback<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    return promise.catch((error) => {
        console.error(`Expenditure page: failed to load ${label}:`, error);
        return fallback;
    });
}

export default async function ExpenditurePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const filters = parseExpenseFilters(await searchParams);

    const [ledger, pending, vendors, categories, projects, pettyCashMetrics, pettyCashAccounts] = await Promise.all([
        getExpenses(filters),
        getExpenses({ status: 'pending', pageSize: 0 }),
        orFallback(getVendors(), [], 'vendors'),
        orFallback(getExpenseCategories(), [], 'expense categories'),
        orFallback(getProjects(), [], 'projects'),
        orFallback(getPettyCashMetrics(), null, 'petty cash metrics'),
        orFallback(getPettyCashAccounts(), [], 'petty cash accounts'),
    ]);

    const lastPage = Math.max(1, Math.ceil(ledger.count / filters.pageSize));
    if (!ledger.error && filters.page > lastPage) {
        redirect(`/expenditure${expenseFiltersToQuery({ ...filters, page: lastPage })}`);
    }

    return (
        <ExpenditurePageClient
            ledger={ledger}
            pending={pending}
            filters={filters}
            vendors={vendors}
            categories={categories}
            projects={projects}
            pettyCashMetrics={pettyCashMetrics}
            pettyCashAccounts={pettyCashAccounts}
        />
    );
}
