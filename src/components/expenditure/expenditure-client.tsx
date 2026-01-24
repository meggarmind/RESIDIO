'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Camera, ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, CheckCircle2, XCircle } from 'lucide-react';
import { updateExpenseStatus } from '@/actions/expenses/update-expense';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';

interface Expense {
    id: string;
    expense_date: string;
    description: string;
    amount: number;
    status: string;
    category?: { id: string; name: string };
    vendor?: { name: string };
    resident?: { first_name: string; last_name: string };
    staff?: { full_name: string };
}

interface ExpenditureClientProps {
    expenses: Expense[];
    onLogExpense: () => void;
    onSnapLog: () => void;
}

export function ExpenditureClient({
    expenses,
    onLogExpense,
    onSnapLog
}: ExpenditureClientProps) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [payeeTypeFilter, setPayeeTypeFilter] = useState<string>('all');

    // Helper functions
    const matchesSearch = (expense: Expense, query: string) => {
        const searchLower = query.toLowerCase();
        return (
            expense.description?.toLowerCase().includes(searchLower) ||
            expense.category?.name?.toLowerCase().includes(searchLower) ||
            expense.vendor?.name?.toLowerCase().includes(searchLower) ||
            expense.resident?.first_name?.toLowerCase().includes(searchLower) ||
            expense.resident?.last_name?.toLowerCase().includes(searchLower) ||
            expense.staff?.full_name?.toLowerCase().includes(searchLower)
        );
    };

    const matchesPayeeType = (expense: Expense, type: string) => {
        if (type === 'vendor') return !!expense.vendor;
        if (type === 'resident') return !!expense.resident;
        if (type === 'staff') return !!expense.staff;
        return false;
    };

    // Get unique categories
    const categories = useMemo(() => {
        const uniqueCategories = new Map();
        expenses.forEach(expense => {
            if (expense.category) {
                uniqueCategories.set(expense.category.id, expense.category);
            }
        });
        return Array.from(uniqueCategories.values());
    }, [expenses]);

    // Filter expenses
    const filteredExpenses = useMemo(() => {
        return expenses.filter(expense => {
            // Search filter
            if (searchQuery && !matchesSearch(expense, searchQuery)) return false;
            // Status filter
            if (statusFilter !== 'all' && expense.status !== statusFilter) return false;
            // Category filter
            if (categoryFilter !== 'all' && expense.category?.id !== categoryFilter) return false;
            // Payee type filter
            if (payeeTypeFilter !== 'all' && !matchesPayeeType(expense, payeeTypeFilter)) return false;
            return true;
        });
    }, [expenses, searchQuery, statusFilter, categoryFilter, payeeTypeFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredExpenses.length / pageSize);
    const paginatedExpenses = filteredExpenses.slice((page - 1) * pageSize, page * pageSize);

    const handleClearFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setCategoryFilter('all');
        setPayeeTypeFilter('all');
        setPage(1);
    };

    return (
        <EnhancedTableCard
            title="Expense Ledger"
            description="All estate expenses and transactions"
        >
            {/* Integrated Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                {/* Primary Search - flex-1 */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by description, payee, or category..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                }}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>

                {/* Category Filter */}
                <Select value={categoryFilter} onValueChange={(val) => {
                    setCategoryFilter(val);
                    setPage(1);
                }}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                                {category.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Payee Type Filter */}
                <Select value={payeeTypeFilter} onValueChange={(val) => {
                    setPayeeTypeFilter(val);
                    setPage(1);
                }}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Payees" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Payees</SelectItem>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="resident">Resident</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                </Select>

                {/* Action Buttons */}
                <Button onClick={onSnapLog} variant="secondary" className="gap-2">
                    <Camera className="h-4 w-4" />
                    Snap & Log
                </Button>
                <Button onClick={onLogExpense} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Log Expense
                </Button>
            </div>

            {/* Active Filter Badges */}
            {(statusFilter !== 'all' || categoryFilter !== 'all' || payeeTypeFilter !== 'all' || searchQuery) && (
                <div className="flex items-center gap-2 mb-4">
                    {statusFilter !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Status: <span className="capitalize">{statusFilter}</span>
                            <button
                                onClick={() => setStatusFilter('all')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {categoryFilter !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Category: {categories.find(c => c.id === categoryFilter)?.name}
                            <button
                                onClick={() => setCategoryFilter('all')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {payeeTypeFilter !== 'all' && (
                        <Badge variant="secondary" className="gap-1">
                            Payee: <span className="capitalize">{payeeTypeFilter}</span>
                            <button
                                onClick={() => setPayeeTypeFilter('all')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {searchQuery && (
                        <Badge variant="secondary" className="gap-1">
                            Search: {searchQuery}
                            <button
                                onClick={() => setSearchQuery('')}
                                className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={handleClearFilters}
                    >
                        Clear all
                    </Button>
                </div>
            )}

            {/* Table Wrapper */}
            <div className="rounded-xl border overflow-hidden shadow-soft animate-slide-up">
                <Table>
                    <TableHeader>
                        <TableRow interactive={false}>
                            <TableHead>Date</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Payee</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedExpenses.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    No expenses found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedExpenses.map((expense) => (
                                <TableRow key={expense.id} className="hover:bg-gray-50 dark:hover:bg-[#0F172A]">
                                    <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                                    <TableCell>{expense.category?.name || '-'}</TableCell>
                                    <TableCell>
                                        {expense.vendor?.name ||
                                            (expense.resident ? `${expense.resident.first_name} ${expense.resident.last_name}` : null) ||
                                            expense.staff?.full_name ||
                                            '-'}
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate">{expense.description}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatCurrency(expense.amount)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={expense.status === 'paid' ? 'success' : expense.status === 'cancelled' ? 'destructive' : 'secondary'}
                                            className="rounded-full"
                                        >
                                            {expense.status}
                                        </Badge>
                                        {expense.status === 'pending' && (
                                            <span className="ml-2 inline-block">
                                                <ExpenseActions expense={expense} />
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer */}
            {filteredExpenses.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mt-4">
                    {/* Left Section - Settings */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Rows per page</span>
                            <Select
                                value={pageSize.toString()}
                                onValueChange={(val) => {
                                    setPageSize(Number(val));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-8 w-[70px] rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredExpenses.length)} of {filteredExpenses.length} expenses
                        </p>
                    </div>

                    {/* Right Section - Navigation */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="h-8 w-9 p-0"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number;
                                if (totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (page <= 3) {
                                    pageNum = i + 1;
                                } else if (page >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                } else {
                                    pageNum = page - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={page === pageNum ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setPage(pageNum)}
                                        className="h-8 w-9 p-0"
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages}
                            className="h-8 w-9 p-0"
                        >
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </EnhancedTableCard>
    );
}

function ExpenseActions({ expense }: { expense: Expense }) {
    const router = useRouter();

    const handleUpdateStatus = async (status: 'paid' | 'cancelled') => {
        try {
            await updateExpenseStatus(expense.id, status);
            toast.success(`Expense marked as ${status}`);
            router.refresh();
        } catch {
            toast.error('Failed to update status');
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleUpdateStatus('paid')}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    Mark as Paid
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleUpdateStatus('cancelled')}>
                    <XCircle className="mr-2 h-4 w-4 text-red-600" />
                    Cancel Expense
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
