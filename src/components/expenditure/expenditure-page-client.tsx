'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { PettyCashDashboard } from './petty-cash-dashboard';
import { ExpenditureClient } from './expenditure-client';
import { SnapLogDialog } from './snap-log-dialog';
import { PettyCashTransactionDialog } from './petty-cash-transaction-dialog';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Receipt } from 'lucide-react';
import { PettyCashMetrics } from '@/actions/finance/petty-cash';
import type { getExpenses } from '@/actions/expenses/get-expenses';
import type { getVendors } from '@/actions/vendors/get-vendors';
import type { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
import type { getProjects } from '@/actions/projects/get-projects';
import type { getPettyCashAccounts } from '@/actions/finance/petty-cash';
import type { getActiveResidents } from '@/actions/residents/get-residents';
import type { getStaff } from '@/actions/settings/get-staff';
import type { Expense } from '@/types/database';
import type { ExpenseFormValues } from './log-expense-dialog';

const LogExpenseDialog = dynamic(
  () => import('./log-expense-dialog').then((m) => ({ default: m.LogExpenseDialog })),
  { ssr: false }
);

interface ExpenditurePageClientProps {
    initialExpenses: Awaited<ReturnType<typeof getExpenses>>;
    vendors: Awaited<ReturnType<typeof getVendors>>;
    categories: Awaited<ReturnType<typeof getExpenseCategories>>;
    projects: Awaited<ReturnType<typeof getProjects>>;
    pettyCashMetrics: PettyCashMetrics;

    pettyCashAccounts: Awaited<ReturnType<typeof getPettyCashAccounts>>;
    residents: NonNullable<Awaited<ReturnType<typeof getActiveResidents>>['data']>;
    staff: Awaited<ReturnType<typeof getStaff>>;
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
    const [dialogInitialData, setDialogInitialData] = useState<Partial<ExpenseFormValues> | null>(null);

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

    const handleSnapLog = (receiptData: Partial<ExpenseFormValues>) => {
        setDialogInitialData(receiptData);
        setIsLogExpenseOpen(true);
    };

    const handleExpenseCreated = (newExpense: Expense) => {
        setExpenses([newExpense, ...expenses]);
        router.refresh(); // Refresh to update balances etc
    };

    const handleTransactionSuccess = () => {
        router.refresh();
    };

    return (
        <div className="space-y-6">
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

            {isLogExpenseOpen && (
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
                initialData={dialogInitialData ?? undefined}
            />
            )}

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
