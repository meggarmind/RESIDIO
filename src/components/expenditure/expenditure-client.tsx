'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { MoreHorizontal, CheckCircle2, XCircle } from 'lucide-react';
import { updateExpenseStatus } from '@/actions/expenses/update-expense';
import { toast } from 'sonner';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { EXPENSE_PAGE_SIZES, expenseFiltersToQuery, type ExpenseFilters } from './expense-filters';
import type { ExpenseCategory } from '@/types/database';

interface Expense {
    id: string;
    expense_date: string;
    description: string | null;
    amount: number;
    status: string | null;
    category?: { name: string } | null;
    vendor?: { name: string } | null;
    resident?: { first_name: string; last_name: string } | null;
    staff?: { full_name: string } | null;
}

interface ExpenditureClientProps {
    expenses: Expense[];
    /** Every expense matching the filters, not just this page. */
    count: number;
    total: number;
    error: string | null;
    filters: ExpenseFilters;
    categories: Pick<ExpenseCategory, 'id' | 'name'>[];
    /** EXPENDITURE_MANAGE: shows the row status actions. */
    canManage: boolean;
}

const STATUS_BADGE: Record<string, 'warning' | 'success' | 'outline'> = {
    pending: 'warning',
    paid: 'success',
    cancelled: 'outline',
};

function payeeName(expense: Expense) {
    return expense.vendor?.name ||
        (expense.resident ? `${expense.resident.first_name} ${expense.resident.last_name}` : null) ||
        expense.staff?.full_name ||
        '-';
}

export function ExpenditureClient({
    expenses,
    count,
    total,
    error,
    filters,
    categories,
    canManage,
}: ExpenditureClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isNavigating, startTransition] = useTransition();
    const [search, setSearch] = useState(filters.search ?? '');

    const latest = useRef(filters);
    useEffect(() => {
        latest.current = filters;
    }, [filters]);

    const applyFilters = (patch: Partial<ExpenseFilters>) => {
        // Any filter change starts again at page 1 unless the patch names a page.
        const next = { ...latest.current, page: 1, ...patch };
        latest.current = next;
        startTransition(() => router.push(`${pathname}${expenseFiltersToQuery(next)}`));
    };

    // Keep the box in step with the URL (back button, Clear filters).
    useEffect(() => {
        setSearch(filters.search ?? '');
    }, [filters.search]);

    // Debounce typing into the URL.
    useEffect(() => {
        const term = search.trim() || undefined;
        if (term === latest.current.search) return;
        const timer = setTimeout(() => applyFilters({ search: term }), 400);
        return () => clearTimeout(timer);
        // The effect only cares about the typed term; applyFilters reads the latest filters from the ref.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const hasFilters = !!(filters.status || filters.categoryId || filters.search);
    const totalPages = Math.max(1, Math.ceil(count / filters.pageSize));
    const firstRow = count === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
    const lastRow = Math.min(filters.page * filters.pageSize, count);
    const columns = canManage ? 7 : 6;

    return (
        <EnhancedTableCard>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
                <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-label="Filter by status"
                    value={filters.status ?? 'all'}
                    onValueChange={(value) => {
                        // Radix sends '' when the pressed item is clicked again; keep the selection.
                        if (!value) return;
                        applyFilters({ status: value === 'all' ? undefined : (value as ExpenseFilters['status']) });
                    }}
                    className="w-full md:w-auto"
                >
                    <ToggleGroupItem value="all" className="h-11 flex-1 px-4 md:h-9 md:flex-none">All</ToggleGroupItem>
                    <ToggleGroupItem value="pending" className="h-11 flex-1 px-4 md:h-9 md:flex-none">Pending</ToggleGroupItem>
                    <ToggleGroupItem value="paid" className="h-11 flex-1 px-4 md:h-9 md:flex-none">Paid</ToggleGroupItem>
                </ToggleGroup>

                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                    <Input
                        type="search"
                        aria-label="Search expenses"
                        placeholder="Search by description, payee, or category..."
                        className="h-11 pl-9 md:h-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <Select
                    value={filters.categoryId ?? 'all'}
                    onValueChange={(value) => applyFilters({ categoryId: value === 'all' ? undefined : value })}
                >
                    <SelectTrigger aria-label="Filter by category" className="h-11 w-full md:h-9 md:w-[200px]">
                        <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                                {category.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {hasFilters && (
                    <Button
                        variant="ghost"
                        className="h-11 gap-1 md:h-9"
                        onClick={() => {
                            setSearch('');
                            applyFilters({ status: undefined, categoryId: undefined, search: undefined });
                        }}
                    >
                        <X className="h-4 w-4" />
                        Clear filters
                    </Button>
                )}
            </div>

            <div
                className="rounded-xl border overflow-x-auto shadow-soft animate-slide-up transition-opacity aria-busy:opacity-60"
                aria-busy={isNavigating}
            >
                <Table className="min-w-[720px]">
                    <TableHeader>
                        <TableRow interactive={false}>
                            <TableHead>Date</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Payee</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            {canManage && <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {error ? (
                            <TableRow interactive={false}>
                                <TableCell colSpan={columns} className="py-12 text-center text-muted-foreground" role="alert">
                                    <span className="inline-flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        Could not load expenses. Refresh to try again.
                                    </span>
                                </TableCell>
                            </TableRow>
                        ) : expenses.length === 0 ? (
                            <TableRow interactive={false}>
                                <TableCell colSpan={columns} className="text-center py-12 text-muted-foreground">
                                    {hasFilters ? 'No expenses match these filters.' : 'No expenses recorded yet.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            expenses.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell className="whitespace-nowrap tabular-nums">{formatDate(expense.expense_date)}</TableCell>
                                    <TableCell>{expense.category?.name || '-'}</TableCell>
                                    <TableCell>{payeeName(expense)}</TableCell>
                                    <TableCell className="max-w-xs truncate">{expense.description}</TableCell>
                                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                                        {formatCurrency(expense.amount)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_BADGE[expense.status ?? ''] ?? 'outline'} className="rounded-full capitalize">
                                            {expense.status}
                                        </Badge>
                                    </TableCell>
                                    {canManage && (
                                        <TableCell className="w-12 text-right">
                                            {expense.status === 'pending' && <ExpenseActions expense={expense} />}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                    {!error && count > 0 && (
                        <TableFooter>
                            <TableRow interactive={false}>
                                <TableCell colSpan={4} className="font-medium">
                                    Total{hasFilters ? ' (filtered)' : ''}, {count} {count === 1 ? 'expense' : 'expenses'}
                                </TableCell>
                                <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                                    {formatCurrency(total)}
                                </TableCell>
                                <TableCell colSpan={columns - 5} />
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
            </div>

            {!error && count > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mt-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground" id="expense-page-size-label">Rows per page</span>
                            <Select
                                value={String(filters.pageSize)}
                                onValueChange={(value) => applyFilters({ pageSize: Number(value) })}
                            >
                                <SelectTrigger aria-labelledby="expense-page-size-label" className="h-11 w-[76px] rounded-xl md:h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPENSE_PAGE_SIZES.map((size) => (
                                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-sm text-muted-foreground tabular-nums">
                            {firstRow}-{lastRow} of {count}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            aria-label="Previous page"
                            onClick={() => applyFilters({ page: latest.current.page - 1 })}
                            disabled={filters.page <= 1}
                            className="h-11 w-11 p-0 md:h-8 md:w-9"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground tabular-nums">
                            Page {filters.page} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            aria-label="Next page"
                            onClick={() => applyFilters({ page: latest.current.page + 1 })}
                            disabled={filters.page >= totalPages}
                            className="h-11 w-11 p-0 md:h-8 md:w-9"
                        >
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </EnhancedTableCard>
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error && error.message ? error.message : 'Failed to update status';
}

/** Row actions for a pending expense. Rendered only for EXPENDITURE_MANAGE holders. */
function ExpenseActions({ expense }: { expense: Expense }) {
    const router = useRouter();
    const [isPending, setIsPending] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    // A ref, not state: a second click can land before the disabled re-render.
    const inFlight = useRef(false);

    const updateStatus = async (status: 'paid' | 'cancelled') => {
        if (inFlight.current) return;
        inFlight.current = true;
        setIsPending(true);
        try {
            const { error } = await updateExpenseStatus(expense.id, status);
            if (error) throw new Error(error);
            toast.success(`Expense marked as ${status}`);
            router.refresh();
        } catch (error) {
            toast.error(errorMessage(error));
            // ConfirmAction keeps its dialog open on a throw so the admin can retry or cancel.
            throw error;
        } finally {
            inFlight.current = false;
            setIsPending(false);
        }
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-11 w-11 p-0 md:h-8 md:w-8"
                        disabled={isPending}
                        aria-label={`Actions for ${expense.description || 'expense'}`}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={isPending} onSelect={() => updateStatus('paid').catch(() => {})}>
                        <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                        Mark as Paid
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={isPending} onSelect={() => setConfirmCancel(true)}>
                        <XCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                        Cancel Expense
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmAction
                open={confirmCancel}
                onOpenChange={setConfirmCancel}
                title="Cancel this expense?"
                description={
                    <p>
                        {expense.description || 'This expense'} for{' '}
                        <span className="font-medium tabular-nums">{formatCurrency(expense.amount)}</span> will be
                        marked cancelled. It stays in the ledger but no longer counts as pending.
                    </p>
                }
                confirmLabel="Mark cancelled"
                destructive
                onConfirm={() => updateStatus('cancelled')}
            />
        </>
    );
}
