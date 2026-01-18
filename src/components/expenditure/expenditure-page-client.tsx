'use client';

import { useState } from 'react';
import { PettyCashDashboard } from './petty-cash-dashboard';
import { LogExpenseDialog } from './log-expense-dialog';
import { ExpenditureClient } from './expenditure-client';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Receipt } from 'lucide-react';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';

interface ExpenditurePageClientProps {
    initialExpenses: any[];
    vendors: any[];
    categories: any[];
    projects: any[];
    pettyCashMetrics: PettyCashMetrics;
}

export function ExpenditurePageClient({
    initialExpenses,
    vendors,
    categories,
    projects,
    pettyCashMetrics
}: ExpenditurePageClientProps) {
    const [expenses, setExpenses] = useState(initialExpenses);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogInitialData, setDialogInitialData] = useState<any>(null);

    const handleLogExpense = () => {
        setDialogInitialData(null);
        setIsDialogOpen(true);
    };

    const handleSnapLog = (receiptData: any) => {
        setDialogInitialData(receiptData);
        setIsDialogOpen(true);
    };

    const handleExpenseCreated = (newExpense: any) => {
        setExpenses([newExpense, ...expenses]);
    };

    return (
        <div className="space-y-6 flex-1 px-4 py-8 md:px-8">
            <EnhancedPageHeader
                title="Estate Expenditure"
                description="Track and manage all estate expenses, vendors, and project costs."
                icon={Receipt}
            />

            <PettyCashDashboard
                data={pettyCashMetrics}
                onSnapLog={handleSnapLog}
            />

            <div className="space-y-4">
                <ExpenditureClient
                    expenses={expenses}
                    onLogExpense={handleLogExpense}
                />
            </div>

            <LogExpenseDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                vendors={vendors}
                categories={categories}
                projects={projects}
                onSuccess={handleExpenseCreated}
                initialData={dialogInitialData}
            />
        </div>
    );
}
