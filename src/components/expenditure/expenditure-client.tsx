'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ExpenditureClientProps {
    expenses: any[];
    onLogExpense: () => void;
    onSnapLog: () => void;
}

export function ExpenditureClient({
    expenses,
    onLogExpense,
    onSnapLog
}: ExpenditureClientProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const totalPages = Math.ceil(expenses.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const currentExpenses = expenses.slice(startIndex, endIndex);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
    };

    const handlePageSizeChange = (value: string) => {
        setPageSize(Number(value));
        setCurrentPage(1); // Reset to first page
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-xl font-semibold">Expense Ledger</CardTitle>
                <div className="flex gap-2">
                    <Button onClick={onSnapLog} variant="secondary" className="gap-2">
                        <Camera className="h-4 w-4" />
                        Snap & Log
                    </Button>
                    <Button onClick={onLogExpense} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Log Expense
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Payee</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {currentExpenses.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    No expenses recorded yet.
                                </TableCell>
                            </TableRow>
                        ) : (
                            currentExpenses.map((expense) => (
                                <TableRow key={expense.id}>
                                    <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                                    <TableCell>{expense.category?.name}</TableCell>
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
                                        <Badge variant={expense.status === 'paid' ? 'success' : 'secondary'}>
                                            {expense.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}

                    </TableBody>
                </Table>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between px-4 py-4 border-t">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Rows per page</span>
                        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={pageSize} />
                            </SelectTrigger>
                            <SelectContent side="top">
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="text-sm font-medium mr-2">
                            Page {currentPage} of {totalPages || 1}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card >
    );
}
