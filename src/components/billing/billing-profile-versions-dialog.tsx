'use client';

/**
 * The estate's rate schedule for one billing profile (#242).
 *
 * A version's `effective_from` is the month its rates start applying, so a
 * historical rate is entered by creating a version with a past month. Versions
 * are never edited once locked or approved -- the invoices they priced carry
 * permanent numbers -- so the dialog offers "add a version", and shows locked
 * ones as read-only.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { History, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-provider';
import { useBillingProfileVersions, useCreateBillingProfileVersion } from '@/hooks/use-billing';
import { formatCurrency } from '@/lib/utils';

const versionFormSchema = z.object({
    // The month picker yields YYYY-MM; the database CHECK requires the
    // month-truncated date, so the day is appended on submit.
    effective_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick the month this rate started applying'),
    items: z
        .array(
            z.object({
                name: z.string().min(1, 'Item name is required'),
                amount: z.number().min(0, 'Amount must be zero or greater'),
                frequency: z.enum(['monthly', 'yearly', 'one_off']),
                is_mandatory: z.boolean(),
            }),
        )
        .min(1, 'At least one rate item is required'),
});

type VersionFormValues = z.infer<typeof versionFormSchema>;

interface BillingProfileVersionsDialogProps {
    profileId: string | null;
    profileName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BillingProfileVersionsDialog({
    profileId,
    profileName,
    open,
    onOpenChange,
}: BillingProfileVersionsDialogProps) {
    const { hasPermission } = useAuth();
    // Mirrors the server guard in createBillingProfileVersion. The server is the
    // enforcement boundary; this only avoids offering a form that would be refused.
    const canManageVersions = hasPermission('billing.manage_profile_versions');

    const { data: versions, isLoading } = useBillingProfileVersions(open && profileId ? profileId : undefined);
    const createMutation = useCreateBillingProfileVersion();

    const form = useForm<VersionFormValues>({
        resolver: zodResolver(versionFormSchema),
        defaultValues: {
            effective_month: '',
            items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }],
        },
    });

    const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

    // The dialog is mounted once and reused per profile, so reset the draft when
    // it opens rather than carrying the previous profile's rates into this one.
    useEffect(() => {
        if (open) {
            form.reset({
                effective_month: '',
                items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }],
            });
        }
    }, [open, profileId, form]);

    async function onSubmit(values: VersionFormValues) {
        if (!profileId) return;
        try {
            await createMutation.mutateAsync({
                billing_profile_id: profileId,
                effective_from: `${values.effective_month}-01`,
                items: values.items,
            });
            form.reset({
                effective_month: '',
                items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }],
            });
        } catch {
            // Surfaced as a toast by the mutation hook.
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Rate versions — {profileName}
                    </DialogTitle>
                    <DialogDescription>
                        Each version records the rates that applied from a given month. A billing period is
                        priced by the newest version effective on or before it, so entering a past month is how
                        a historical rate is recorded.
                    </DialogDescription>
                </DialogHeader>

                <section className="space-y-2">
                    <h4 className="text-sm font-medium">Existing schedule</h4>
                    {isLoading && <p className="text-sm text-muted-foreground">Loading rate versions…</p>}
                    {!isLoading && (!versions || versions.length === 0) && (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No rate versions recorded yet.
                        </p>
                    )}
                    {versions?.map((version) => (
                        <div key={version.id} className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                    Effective {version.effective_from.slice(0, 7)}
                                </span>
                                <div className="flex gap-1">
                                    {version.is_locked && (
                                        <Badge variant="secondary" className="text-xs">
                                            <Lock className="mr-1 h-3 w-3" />
                                            Locked
                                        </Badge>
                                    )}
                                    {version.approved_by && (
                                        <Badge variant="outline" className="text-xs">
                                            Approved
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 space-y-1">
                                {version.items.map((item) => (
                                    <div key={item.id} className="flex justify-between text-sm">
                                        <span>{item.name}</span>
                                        <span className="font-medium">
                                            {formatCurrency(Number(item.amount))}
                                            <span className="ml-1 text-xs text-muted-foreground">/{item.frequency}</span>
                                        </span>
                                    </div>
                                ))}
                                {version.items.length === 0 && (
                                    <p className="text-sm italic text-muted-foreground">No items on this version</p>
                                )}
                            </div>
                        </div>
                    ))}
                </section>

                {canManageVersions ? (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-lg border p-4">
                            <h4 className="text-sm font-medium">Add a rate version</h4>

                            <FormField
                                control={form.control}
                                name="effective_month"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Effective from</FormLabel>
                                        <FormControl>
                                            <Input type="month" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            The first month these rates applied. Past months are allowed and are how
                                            historical rates are entered.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-3">
                                {fields.map((fieldItem, index) => (
                                    <div key={fieldItem.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.name`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input placeholder="Item name" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.amount`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <CurrencyInput
                                                            value={field.value}
                                                            onValueChange={field.onChange}
                                                            placeholder="0.00"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.frequency`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="monthly">Monthly</SelectItem>
                                                            <SelectItem value="yearly">Yearly</SelectItem>
                                                            <SelectItem value="one_off">One-off</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive"
                                            disabled={fields.length === 1}
                                            onClick={() => remove(index)}
                                            aria-label="Remove rate item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({ name: '', amount: 0, frequency: 'monthly', is_mandatory: true })}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Add item
                            </Button>

                            <Button type="submit" className="w-full" disabled={createMutation.isPending || !profileId}>
                                {createMutation.isPending ? 'Saving…' : 'Create rate version'}
                            </Button>
                        </form>
                    </Form>
                ) : (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        You do not have permission to add rate versions.
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}
