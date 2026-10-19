'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PettyCashDashboard } from './petty-cash-dashboard';
import { ExpenditureClient } from './expenditure-client';
import { SnapLogDialog } from './snap-log-dialog';
import { PettyCashTransactionDialog } from './petty-cash-transaction-dialog';
import { ManagePettyCashDialog } from './petty-cash/manage-accounts-dialog';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Coins, Plus, Receipt, Settings } from 'lucide-react';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getActiveResidents } from '@/actions/residents/get-residents';
import { getStaff } from '@/actions/settings/get-staff';
import type { PettyCashMetrics } from '@/actions/finance/petty-cash';
import type { getExpenses } from '@/actions/expenses/get-expenses';
import type { getVendors } from '@/actions/vendors/get-vendors';
import type { getExpenseCategories } from '@/actions/expenses/get-expense-categories';
import type { getProjects } from '@/actions/projects/get-projects';
import type { getPettyCashAccounts } from '@/actions/finance/petty-cash';
import type { ExpenseFormValues } from './log-expense-dialog';
import type { ExpenseFilters } from './expense-filters';

const LogExpenseDialog = dynamic(
  () => import('./log-expense-dialog').then((m) => ({ default: m.LogExpenseDialog })),
  { ssr: false }
);

type Ledger = Awaited<ReturnType<typeof getExpenses>>;

interface Payees {
    residents: Awaited<ReturnType<typeof getActiveResidents>>['data'];
    staff: Awaited<ReturnType<typeof getStaff>>;
}

interface ExpenditurePageClientProps {
    ledger: Ledger;
    pending: Ledger;
    filters: ExpenseFilters;
    vendors: Awaited<ReturnType<typeof getVendors>>;
    categories: Awaited<ReturnType<typeof getExpenseCategories>>;
    projects: Awaited<ReturnType<typeof getProjects>>;
    pettyCashMetrics: PettyCashMetrics | null;
    pettyCashAccounts: Awaited<ReturnType<typeof getPettyCashAccounts>>;
}

export function ExpenditurePageClient({
    ledger,
    pending,
    filters,
    vendors,
    categories,
    projects,
    pettyCashMetrics,
    pettyCashAccounts,
}: ExpenditurePageClientProps) {
    const router = useRouter();
    // Presentation only: the write actions enforce EXPENDITURE_MANAGE themselves.
    const canManage = useCan(PERMISSIONS.EXPENDITURE_MANAGE);
    const [isLogExpenseOpen, setIsLogExpenseOpen] = useState(false);
    const [isSnapLogOpen, setIsSnapLogOpen] = useState(false);
    const [isTransactionOpen, setIsTransactionOpen] = useState(false);
    const [isManageAccountsOpen, setIsManageAccountsOpen] = useState(false);
    const [dialogInitialData, setDialogInitialData] = useState<Partial<ExpenseFormValues> | null>(null);
    const [payees, setPayees] = useState<Payees | null>(null);

    // Residents and staff only fill the log dialog's payee list, so load them when it first opens.
    useEffect(() => {
        if (!isLogExpenseOpen || payees) return;
        let cancelled = false;
        Promise.all([getActiveResidents(), getStaff()])
            .then(([residents, staff]) => {
                if (!cancelled) setPayees({ residents: residents.data, staff });
            })
            .catch((error) => {
                console.error('Failed to load residents and staff for the expense payee list:', error);
                if (!cancelled) toast.error('Could not load residents and staff for the payee list');
            });
        return () => {
            cancelled = true;
        };
    }, [isLogExpenseOpen, payees]);

    const handleLogExpense = () => {
        setDialogInitialData(null);
        setIsLogExpenseOpen(true);
    };

    const handleScanReceipt = () => {
        setIsLogExpenseOpen(false);
        setIsSnapLogOpen(true);
    };

    const handleSnapLog = (receiptData: Partial<ExpenseFormValues>) => {
        setDialogInitialData(receiptData);
        setIsLogExpenseOpen(true);
    };

    return (
        <div className="space-y-6">
            <EnhancedPageHeader
                title="Estate Expenditure"
                description="Track and manage all estate expenses, vendors, and project costs."
                icon={Receipt}
                actions={
                    canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="h-11 gap-2 md:h-9">
                                        <Coins className="h-4 w-4" />
                                        Petty cash
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => setIsTransactionOpen(true)}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Top up
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => setIsManageAccountsOpen(true)}>
                                        <Settings className="mr-2 h-4 w-4" />
                                        Manage accounts
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button onClick={handleLogExpense} className="h-11 gap-2 md:h-9">
                                <Plus className="h-4 w-4" />
                                Log Expense
                            </Button>
                        </div>
                    )
                }
            />

            <PettyCashDashboard data={pettyCashMetrics} pending={pending} />

            <ExpenditureClient
                expenses={ledger.data}
                count={ledger.count}
                total={ledger.total}
                error={ledger.error}
                filters={filters}
                categories={categories}
                canManage={canManage}
            />

            {canManage && (
                <>
                    {isLogExpenseOpen && (
                        <LogExpenseDialog
                            open={isLogExpenseOpen}
                            onOpenChange={setIsLogExpenseOpen}
                            vendors={vendors}
                            categories={categories}
                            projects={projects}
                            pettyCashAccounts={pettyCashAccounts}
                            residents={payees?.residents}
                            staff={payees?.staff}
                            onSuccess={() => router.refresh()}
                            initialData={dialogInitialData ?? undefined}
                            onScanReceipt={handleScanReceipt}
                        />
                    )}

                    <PettyCashTransactionDialog
                        open={isTransactionOpen}
                        onOpenChange={setIsTransactionOpen}
                        accounts={pettyCashAccounts}
                        onSuccess={() => router.refresh()}
                    />

                    <ManagePettyCashDialog open={isManageAccountsOpen} onOpenChange={setIsManageAccountsOpen} />

                    <SnapLogDialog
                        open={isSnapLogOpen}
                        onOpenChange={setIsSnapLogOpen}
                        onSnapLog={handleSnapLog}
                    />
                </>
            )}
        </div>
    );
}
