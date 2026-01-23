'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PettyCashDashboard } from './petty-cash-dashboard';
import { LogExpenseDialog } from './log-expense-dialog';
import { ExpenditureClient } from './expenditure-client';
import { SnapLogDialog } from './snap-log-dialog';
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
    residents: any[];
    staff: any[];
}

export function ExpenditurePageClient({
    initialExpenses,
    vendors,
    categories,
    projects,
    pettyCashMetrics,

    pettyCashAccounts,
    residents,
    staff
}: ExpenditurePageClientProps) {
    const router = useRouter();
    const [expenses, setExpenses] = useState(initialExpenses);
    const [isLogExpenseOpen, setIsLogExpenseOpen] = useState(false);
    const [isSnapLogOpen, setIsSnapLogOpen] = useState(false);
    const [isTransactionOpen, setIsTransactionOpen] = useState(false);
    const [dialogInitialData, setDialogInitialData] = useState<any>(null);

    // Sync state with server-side data
    useEffect(() => {
        setExpenses(initialExpenses);
    }, [initialExpenses]);

    const handleLogExpense = () => {
        setDialogInitialData(null);
        setIsLogExpenseOpen(true);
    };

    const handleSnapLogTrigger = () => {
        setIsSnapLogOpen(true);
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
                    onSnapLog={handleSnapLogTrigger}
                />
            </div>

            <LogExpenseDialog
                open={isLogExpenseOpen}
                onOpenChange={setIsLogExpenseOpen}
                vendors={vendors}
                categories={categories}
                projects={projects}
                pettyCashAccounts={pettyCashAccounts}
                residents={residents}
                staff={staff}
                onSuccess={handleExpenseCreated}
                initialData={dialogInitialData}
            />

            <PettyCashTransactionDialog
                open={isTransactionOpen}
                onOpenChange={setIsTransactionOpen}
                accounts={pettyCashAccounts}
                onSuccess={handleTransactionSuccess}
            />

            <SnapLogDialog
                open={isSnapLogOpen}
                onOpenChange={setIsSnapLogOpen}
                onSnapLog={handleSnapLog}
            />
        </div>
    );
}
