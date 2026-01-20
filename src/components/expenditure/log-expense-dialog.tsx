'use client';

import { useState, useEffect } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Wallet, Building2, CreditCard } from 'lucide-react';

const expenseSchema = z.object({
    amount: z.string().min(1, 'Amount is required'),
    category_id: z.string().min(1, 'Category is required'),
    expense_date: z.string().min(1, 'Date is required'),
    description: z.string().optional(),
    payee_type: z.enum(['vendor', 'resident', 'staff', 'none']).default('vendor'),
    vendor_id: z.string().optional(),
    resident_id: z.string().optional(),
    staff_id: z.string().optional(),
    project_id: z.string().optional(),
    status: z.enum(['pending', 'paid', 'cancelled']),
    source_type: z.enum(['manual', 'petty_cash', 'bank_import']).default('manual'),
    payment_method: z.enum(['bank_transfer', 'cash', 'card', 'cheque', 'other']).default('bank_transfer'),
    petty_cash_account_id: z.string().optional(),
}).refine((data) => {
    if (data.source_type === 'petty_cash' && !data.petty_cash_account_id) {
        return false;
    }
    return true;
}, {
    message: "Petty cash account is required",
    path: ["petty_cash_account_id"]
});

interface LogExpenseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vendors: any[];
    categories: any[];
    projects: any[];
    residents?: any[];
    staff?: any[];
    pettyCashAccounts?: any[];
    onSuccess: (newExpense: any) => void;
    initialData?: Partial<ExpenseFormValues>;
}

interface ExpenseFormValues {
    amount: string;
    category_id: string;
    expense_date: string;
    description?: string;
    payee_type: 'vendor' | 'resident' | 'staff' | 'none';
    vendor_id?: string;
    resident_id?: string;
    staff_id?: string;
    project_id?: string;
    status: 'pending' | 'paid' | 'cancelled';
    source_type: 'manual' | 'petty_cash' | 'bank_import';
    payment_method: 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'other';
    petty_cash_account_id?: string;
}

export function LogExpenseDialog({
    open,
    onOpenChange,
    vendors,
    categories,
    projects,
    residents = [],
    staff = [],
    pettyCashAccounts = [],
    onSuccess,
    initialData
}: LogExpenseDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ExpenseFormValues>({
        resolver: zodResolver(expenseSchema),
        defaultValues: {
            amount: initialData?.amount || '',
            category_id: initialData?.category_id || '',
            expense_date: initialData?.expense_date || new Date().toISOString().split('T')[0],
            description: initialData?.description || '',
            payee_type: initialData?.payee_type || 'vendor',
            vendor_id: initialData?.vendor_id || '',
            resident_id: initialData?.resident_id || '',
            staff_id: initialData?.staff_id || '',
            project_id: initialData?.project_id || '',
            status: initialData?.status || 'paid',
            source_type: initialData?.source_type || 'manual',
            payment_method: initialData?.payment_method || 'bank_transfer',
            petty_cash_account_id: initialData?.petty_cash_account_id || '',
        },
    });

    const sourceType = form.watch('source_type');
    const payeeType = form.watch('payee_type');

    // Auto-set payment method based on source
    useEffect(() => {
        if (sourceType === 'petty_cash') {
            form.setValue('payment_method', 'cash');
            form.setValue('status', 'paid');
            // If only one petty cash account, auto-select it
            if (pettyCashAccounts.length === 1) {
                form.setValue('petty_cash_account_id', pettyCashAccounts[0].id);
            }
        } else if (sourceType === 'manual') {
            form.setValue('payment_method', 'bank_transfer');
        }
    }, [sourceType, form, pettyCashAccounts]);

    async function onSubmit(data: ExpenseFormValues) {
        setIsSubmitting(true);
        try {
            // Ensure we only send the relevant ID based on payee_type
            const payload = { ...data, amount: Number(data.amount) };

            if (data.payee_type !== 'vendor') payload.vendor_id = '';
            if (data.payee_type !== 'resident') payload.resident_id = '';
            if (data.payee_type !== 'staff') payload.staff_id = '';

            // If type is 'none', clear all
            if (data.payee_type === 'none') {
                payload.vendor_id = '';
                payload.resident_id = '';
                payload.staff_id = '';
            }

            const result = await createExpense(payload);
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

    useEffect(() => {
        if (open && initialData) {
            form.reset({
                amount: initialData.amount || '',
                category_id: initialData.category_id || '',
                expense_date: initialData.expense_date || new Date().toISOString().split('T')[0],
                description: initialData.description || '',
                payee_type: initialData.payee_type || 'vendor',
                vendor_id: initialData.vendor_id || '',
                resident_id: initialData.resident_id || '',
                staff_id: initialData.staff_id || '',
                project_id: initialData.project_id || '',
                status: initialData.status || 'paid',
                source_type: initialData.source_type || 'manual',
                payment_method: initialData.payment_method || 'bank_transfer',
                petty_cash_account_id: initialData.petty_cash_account_id || '',
            });
        }
    }, [open, initialData, form]);


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Log Estate Expense</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">

                        {/* Source Selection */}
                        <FormField
                            control={form.control}
                            name="source_type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Payment Source</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="grid grid-cols-2 gap-4"
                                        >
                                            <FormItem>
                                                <FormControl>
                                                    <RadioGroupItem value="manual" className="peer sr-only" />
                                                </FormControl>
                                                <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                                    <Building2 className="mb-3 h-6 w-6" />
                                                    Bank Transfer / Card
                                                </FormLabel>
                                            </FormItem>
                                            <FormItem>
                                                <FormControl>
                                                    <RadioGroupItem value="petty_cash" className="peer sr-only" />
                                                </FormControl>
                                                <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                                    <Wallet className="mb-3 h-6 w-6" />
                                                    Petty Cash
                                                </FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Petty Cash Account Selector */}
                        {sourceType === 'petty_cash' && (
                            <FormField
                                control={form.control}
                                name="petty_cash_account_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Paid From</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select petty cash account" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {pettyCashAccounts.map((account) => (
                                                    <SelectItem key={account.id} value={account.id}>
                                                        {account.name} (Bal: ₦{account.currentBalance?.toLocaleString()})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <div className="grid grid-cols-2 gap-4">
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
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="category_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Category</FormLabel>
                                        <Select
                                            onValueChange={(value) => {
                                                if (value === "unselected_reset") {
                                                    field.onChange("");
                                                } else {
                                                    field.onChange(value);
                                                }
                                            }}
                                            defaultValue={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select category" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="unselected_reset">None</SelectItem>
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

                            {/* Payee Type Selector */}
                            <FormField
                                control={form.control}
                                name="payee_type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Payee Type</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Who is this payment for?" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="vendor">External Vendor</SelectItem>
                                                <SelectItem value="resident">Resident</SelectItem>
                                                <SelectItem value="staff">Staff / EXCO</SelectItem>
                                                <SelectItem value="none">No Payee</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Conditional Payee Selector */}
                        {payeeType === 'vendor' && (
                            <FormField
                                control={form.control}
                                name="vendor_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Select Vendor</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select vendor" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
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
                        )}

                        {payeeType === 'resident' && (
                            <FormField
                                control={form.control}
                                name="resident_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Select Resident</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select resident" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {residents.map((resident) => (
                                                    <SelectItem key={resident.id} value={resident.id}>
                                                        {resident.first_name} {resident.last_name} ({resident.resident_code})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        {payeeType === 'staff' && (
                            <FormField
                                control={form.control}
                                name="staff_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Select Staff/EXCO</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select staff member" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {staff.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.full_name} ({s.role})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

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

                        {sourceType === 'manual' && (
                            <FormField
                                control={form.control}
                                name="status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Payment Status</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="paid">Paid</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <DialogFooter>
                            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                                {isSubmitting ? 'Recording...' : 'Record Expense'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
