import { getExpenses } from '@/actions/expenses/get-expenses';
import { getVendors } from '@/actions/vendors/get-vendors';
import { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
import { getProjects } from '@/actions/projects/get-projects';
import { getPettyCashMetrics } from '@/actions/finance/petty-cash';
import { ExpenditurePageClient } from '@/components/expenditure/expenditure-page-client';

export default async function ExpenditurePage() {
    const [expenses, vendors, categories, projects, pettyCashMetrics] = await Promise.all([
        getExpenses(),
        getVendors(),
        getExpenseCategories(),
        getProjects(),
        getPettyCashMetrics(),
    ]);

    return (
        <ExpenditurePageClient
            initialExpenses={expenses}
            vendors={vendors}
            categories={categories}
            projects={projects}
            pettyCashMetrics={pettyCashMetrics}
        />
    );
}
