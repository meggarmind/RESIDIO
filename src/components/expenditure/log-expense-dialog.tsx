'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { createExpense } from '@/actions/expenses/create-expense';
import { toast } from 'sonner';

const expenseSchema = z.object({
    amount: z.string().min(1, 'Amount is required'),
    category_id: z.string().min(1, 'Category is required'),
    expense_date: z.string().min(1, 'Date is required'),
    description: z.string().optional(),
    vendor_id: z.string().optional(),
    project_id: z.string().optional(),
    status: z.enum(['pending', 'paid', 'cancelled']),
});

interface LogExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vendors: any[];
    categories: any[];
    projects: any[];
    onSuccess: (newExpense: any) => void;
}

interface ExpenseFormValues {
    amount: string;
    category_id: string;
    expense_date: string;
    description?: string;
    vendor_id?: string;
    project_id?: string;
    status: 'pending' | 'paid' | 'cancelled';
}

export function LogExpenseDialog({
    open,
    onOpenChange,
    vendors,
    categories,
    projects,
    onSuccess
}: LogExpenseDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            amount: '',
            category_id: '',
            expense_date: new Date().toISOString().split('T')[0],
            description: '',
            vendor_id: '',
            project_id: '',
            status: 'paid',
        },
    });

    async function onSubmit(data: ExpenseFormValues) {
        setIsSubmitting(true);
        try {
            const result = await createExpense({
                ...data,
                amount: Number(data.amount)
            });
            toast.success('Expense recorded successfully');
            onSuccess(result);
            onOpenChange(false);
            form.reset();
        } catch (error) {
            toast.error('Failed to record expense');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Log Estate Expense</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="amount"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Amount</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="0.00" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="category_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Category</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {categories.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id}>
                                                    {cat.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="vendor_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor (Optional)</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select vendor" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {vendors.map((vendor) => (
                                                <SelectItem key={vendor.id} value={vendor.id}>
                                                    {vendor.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="expense_date"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Date</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="project_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Link to Project (Optional)</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Social/Capital Project" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="none">Not linked to project</SelectItem>
                                            {projects.map((project) => (
                                                <SelectItem key={project.id} value={project.id}>
                                                    {project.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Input placeholder="What was this for?" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Recording...' : 'Record Expense'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
