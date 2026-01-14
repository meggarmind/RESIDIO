'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { LogExpenseDialog } from './log-expense-dialog';

interface ExpenditureClientProps {
    initialExpenses: any[];
    vendors: any[];
    categories: any[];
    projects: any[];
}

export function ExpenditureClient({
    initialExpenses,
    vendors,
    categories,
    projects
}: ExpenditureClientProps) {
    const [expenses, setExpenses] = useState(initialExpenses);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Expense Ledger</h2>
                <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Log Expense
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {expenses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        No expenses recorded yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                expenses.map((expense) => (
                                    <TableRow key={expense.id}>
                                        <TableCell>{new Date(expense.expense_date).toLocaleDateString()}</TableCell>
                                        <TableCell>{expense.category?.name}</TableCell>
                                        <TableCell>{expense.vendor?.name || '-'}</TableCell>
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
                </CardContent>
            </Card>

            <LogExpenseDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                vendors={vendors}
                categories={categories}
                projects={projects}
                onSuccess={(newExpense) => setExpenses([newExpense, ...expenses])}
            />
        </div>
    );
}
