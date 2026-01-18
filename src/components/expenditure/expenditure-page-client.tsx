'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PettyCashDashboard } from './petty-cash-dashboard';
import { LogExpenseDialog } from './log-expense-dialog';
import { ExpenditureClient } from './expenditure-client';
import { PettyCashTransactionDialog } from './petty-cash-transaction-dialog';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Receipt } from 'lucide-react';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';

interface ExpenditurePageClientProps {
    initialExpenses: any[];
    vendors: any[];
    categories: any[];
    projects: any[];
    pettyCashMetrics: PettyCashMetrics;
    pettyCashAccounts: any[];
}

export function ExpenditurePageClient({
    initialExpenses,
    vendors,
    categories,
    projects,
    pettyCashMetrics,
    pettyCashAccounts
}: ExpenditurePageClientProps) {
    const router = useRouter();
    const [expenses, setExpenses] = useState(initialExpenses);
    const [isLogExpenseOpen, setIsLogExpenseOpen] = useState(false);
    const [isTransactionOpen, setIsTransactionOpen] = useState(false);
    const [dialogInitialData, setDialogInitialData] = useState<any>(null);

    const handleLogExpense = () => {
        setDialogInitialData(null);
        setIsLogExpenseOpen(true);
    };

    const handleSnapLog = (receiptData: any) => {
        setDialogInitialData(receiptData);
        setIsLogExpenseOpen(true);
    };

    const handleExpenseCreated = (newExpense: any) => {
        setExpenses([newExpense, ...expenses]);
        router.refresh(); // Refresh to update balances etc
    };

    const handleTransactionSuccess = () => {
        router.refresh();
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
                onTopUp={() => setIsTransactionOpen(true)}
            />

            <div className="space-y-4">
                <ExpenditureClient
                    expenses={expenses}
                    onLogExpense={handleLogExpense}
                />
            </div>

            <LogExpenseDialog
                open={isLogExpenseOpen}
                onOpenChange={setIsLogExpenseOpen}
                vendors={vendors}
                categories={categories}
                projects={projects}
                pettyCashAccounts={pettyCashAccounts}
                onSuccess={handleExpenseCreated}
                initialData={dialogInitialData}
            />

            <PettyCashTransactionDialog
                open={isTransactionOpen}
                onOpenChange={setIsTransactionOpen}
                accounts={pettyCashAccounts}
                onSuccess={handleTransactionSuccess}
            />
        </div>
    );
}
