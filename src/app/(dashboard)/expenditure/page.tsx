import { getExpenses } from '@/actions/expenses/get-expenses';
import { getVendors } from '@/actions/vendors/get-vendors';
import { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
import { getProjects } from '@/actions/projects/get-projects';
import { ExpenditureClient } from '@/components/expenditure/expenditure-client';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Receipt } from 'lucide-react';

export default async function ExpenditurePage() {
    const [expenses, vendors, categories, projects] = await Promise.all([
        getExpenses(),
        getVendors(),
        getExpenseCategories(),
        getProjects(),
    ]);

    return (
        <div className="space-y-6 flex-1 px-4 py-8 md:px-8">
            <EnhancedPageHeader
                title="Estate Expenditure"
                description="Track and manage all estate expenses, vendors, and project costs."
                icon={Receipt}
            />

            <ExpenditureClient
                initialExpenses={expenses}
                vendors={vendors}
                categories={categories}
                projects={projects}
            />
        </div>
    );
}
