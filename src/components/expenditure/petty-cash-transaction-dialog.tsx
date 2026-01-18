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
    DialogDescription,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { replenishPettyCashAccount, recordCashCollection } from '@/actions/finance/petty-cash';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const transactionSchema = z.object({
    amount: z.string().min(1, 'Amount is required'),
    account_id: z.string().min(1, 'Account is required'),
    type: z.enum(['replenish', 'collection']),
    description: z.string().min(1, 'Description is required'),
});

interface PettyCashTransactionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: any[];
    onSuccess: () => void;
}

export function PettyCashTransactionDialog({
    open,
    onOpenChange,
    accounts,
    onSuccess
}: PettyCashTransactionDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<z.infer<typeof transactionSchema>>({
        resolver: zodResolver(transactionSchema),
        defaultValues: {
            amount: '',
            account_id: accounts.length === 1 ? accounts[0].id : '',
            type: 'replenish',
            description: '',
        },
    });

    const type = form.watch('type');

    async function onSubmit(data: z.infer<typeof transactionSchema>) {
        setIsSubmitting(true);
        try {
            if (data.type === 'replenish') {
                const result = await replenishPettyCashAccount(data.account_id, Number(data.amount), data.description);
                if (!result.success) throw new Error(result.error);
                toast.success('Account replenished successfully');
            } else {
                const result = await recordCashCollection(data.account_id, Number(data.amount), data.description);
                if (!result.success) throw new Error(result.error);
                toast.success('Cash collection recorded successfully');
            }
            onSuccess();
            onOpenChange(false);
            form.reset();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Transaction failed');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Petty Cash Transaction</DialogTitle>
                    <DialogDescription>
                        Record money coming into the petty cash account.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">

                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="grid grid-cols-2 gap-4"
                                        >
                                            <FormItem>
                                                <FormControl>
                                                    <RadioGroupItem value="replenish" className="peer sr-only" />
                                                </FormControl>
                                                <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                                    <ArrowDownLeft className="mb-3 h-6 w-6 text-blue-500" />
                                                    Replenish (From Bank)
                                                </FormLabel>
                                            </FormItem>
                                            <FormItem>
                                                <FormControl>
                                                    <RadioGroupItem value="collection" className="peer sr-only" />
                                                </FormControl>
                                                <FormLabel className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer">
                                                    <ArrowUpRight className="mb-3 h-6 w-6 text-emerald-500" />
                                                    Income (Cash Collection)
                                                </FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="account_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Account</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select account" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {accounts.map((account) => (
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
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Input placeholder={type === 'replenish' ? "e.g. Withdrawal from GTBank" : "e.g. Gate Toll Collection"} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Recording...' : 'Record Transaction'}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
