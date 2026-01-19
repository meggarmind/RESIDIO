'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import {
    Loader2,
    Plus,
    Settings,
    Power,
    Pencil,
    Archive,
    RefreshCcw,
    X
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
    createPettyCashAccount,
    updatePettyCashAccount,
    togglePettyCashAccountStatus,
    getPettyCashAccounts
} from '@/actions/finance/petty-cash';
import { PettyCashAccount } from '@/types/database';

// Schema for create/edit
const accountSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    initialFloat: z.string().transform((val) => Number(val)).pipe(z.number().min(0)),
    notes: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export function ManagePettyCashDialog() {
    const [open, setOpen] = useState(false);
    const [accounts, setAccounts] = useState<PettyCashAccount[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit logic
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form for Add/Edit
    const form = useForm<AccountFormValues>({
        resolver: zodResolver(accountSchema),
        defaultValues: {
            name: '',
            initialFloat: 0,
            notes: '',
        },
    });

    const fetchAccounts = async () => {
        setLoading(true);
        const data = await getPettyCashAccounts();
        setAccounts(data);
        setLoading(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (newOpen) {
            fetchAccounts();
            resetView();
        }
    };

    const resetView = () => {
        setEditingId(null);
        setIsCreating(false);
        form.reset({
            name: '',
            initialFloat: 0,
            notes: ''
        });
    };

    const startCreate = () => {
        resetView();
        setIsCreating(true);
    };

    const startEdit = (account: PettyCashAccount) => {
        setEditingId(account.id);
        setIsCreating(false);
        form.reset({
            name: account.name,
            initialFloat: Number(account.initial_float) || 0,
            notes: account.notes || '',
        });
    };

    async function onSubmit(values: AccountFormValues) {
        setIsSubmitting(true);
        try {
            if (editingId) {
                const { error } = await updatePettyCashAccount(editingId, values);
                if (error) throw new Error(error);
                toast.success('Account updated');
            } else {
                const { error } = await createPettyCashAccount(values);
                if (error) throw new Error(error);
                toast.success('Account created');
            }
            await fetchAccounts();
            resetView();
        } catch (error) {
            console.error(error);
            toast.error('Operation failed');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function toggleStatus(id: string, currentStatus: boolean) {
        try {
            const { success, error } = await togglePettyCashAccountStatus(id, !currentStatus);
            if (!success) throw new Error(error || 'Failed');
            toast.success(currentStatus ? 'Account deactivated' : 'Account activated');
            fetchAccounts();
        } catch (error) {
            toast.error('Failed to update status');
        }
    }

    const isFormVisible = isCreating || !!editingId;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Manage Accounts
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b">
                    <DialogTitle>Manage Petty Cash Accounts</DialogTitle>
                    <DialogDescription>
                        Create, edit, or deactivate petty cash wallets.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-1 overflow-hidden">
                    {/* List Side */}
                    <div className={`flex-1 flex flex-col border-r ${isFormVisible ? 'hidden md:flex md:w-1/2' : 'w-full'}`}>
                        <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                            <h4 className="font-medium text-sm text-muted-foreground">Accounts</h4>
                            <Button size="sm" variant="ghost" onClick={startCreate} disabled={isFormVisible && !editingId && isCreating}>
                                <Plus className="h-3.5 w-3.5 mr-1" /> New
                            </Button>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-2">
                                {loading ? (
                                    <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                                ) : accounts.length === 0 ? (
                                    <div className="text-center p-8 text-sm text-muted-foreground">No accounts found.</div>
                                ) : (
                                    accounts.map((acc) => (
                                        <div
                                            key={acc.id}
                                            className={`p-3 rounded-lg border text-sm transition-colors cursor-pointer hover:bg-accent/50 group ${editingId === acc.id ? 'bg-accent border-primary/50' : ''}`}
                                            onClick={() => startEdit(acc)}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="font-medium flex items-center gap-2">
                                                    {acc.name}
                                                    {!acc.is_active && <Badge variant="secondary" className="text-[10px] h-4 px-1">Inactive</Badge>}
                                                </div>
                                                {/* Actions only visible on hover or if selected? No, maybe always visible for toggle */}
                                            </div>
                                            <div className="flex justify-between items-end">
                                                <div className="text-muted-foreground text-xs">
                                                    Bal: ₦{Number(acc.current_balance).toLocaleString()}
                                                </div>
                                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                        onClick={() => startEdit(acc)}
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className={`h-6 w-6 ${acc.is_active ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
                                                        title={acc.is_active ? 'Deactivate' : 'Activate'}
                                                        onClick={() => toggleStatus(acc.id, acc.is_active)}
                                                    >
                                                        <Power className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Form Side */}
                    {(isFormVisible) && (
                        <div className="flex-1 flex flex-col bg-muted/10 md:w-1/2 w-full absolute md:relative inset-0 bg-background md:bg-transparent z-10 md:z-auto">
                            <div className="p-4 border-b flex justify-between items-center bg-muted/20 md:bg-transparent">
                                <h4 className="font-medium text-sm">
                                    {editingId ? 'Edit Account' : 'New Account'}
                                </h4>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="p-6">
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Account Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="e.g. Main Box" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="initialFloat"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Initial Float Limit (₦)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" placeholder="0.00" {...field} onChange={e => field.onChange(e.target.value)} />
                                                    </FormControl>
                                                    <p className="text-[10px] text-muted-foreground">The standard float amount for this account.</p>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="notes"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Notes</FormLabel>
                                                    <FormControl>
                                                        <Textarea placeholder="Optional details..." {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <div className="pt-4 flex justify-end gap-2">
                                            <Button type="button" variant="outline" onClick={resetView}>Cancel</Button>
                                            <Button type="submit" disabled={isSubmitting}>
                                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Save
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>
                        </div>
                    )}

                    {!isFormVisible && (
                        <div className="flex-1 hidden md:flex items-center justify-center text-muted-foreground text-sm bg-muted/5">
                            Select an account to edit or create a new one.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
