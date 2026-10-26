'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useCreatePayment, useUpdatePayment, useResidentPropertiesForPayment } from '@/hooks/use-payments';
import { useResidentOptions } from '@/hooks/use-residents';
import { getLockedPaymentFields, VERIFIED_LOCK_MESSAGE } from '@/lib/payments/verified-lock';
import { paymentFormSchema, type PaymentFormData } from '@/lib/validators/payment';
import { ChargeCategorySelect } from '@/components/billing/charge-category-select';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import type { Database } from '@/types/database.generated';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatCurrency, cn } from '@/lib/utils';
import { Home, AlertTriangle, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Select items cannot hold an empty value; this one means "paid by the resident whose wallet is credited".
const PAID_BY_SELF = '__resident__';

interface PaymentFormProps {
    initialData?: Database['public']['Tables']['payment_records']['Row'];
    residentId?: string;
    onSuccess?: () => void;
}

export function PaymentForm({ initialData, residentId, onSuccess }: PaymentFormProps) {
    const router = useRouter();
    const createMutation = useCreatePayment();
    const updateMutation = useUpdatePayment();
    // Reduced limit - consider implementing async search for large estates
    const { data: residentsData, isLoading: residentsLoading } = useResidentOptions();
    const [submitState, setSubmitState] = React.useState<'idle' | 'loading' | 'success'>('idle');

    const isEditing = !!initialData;
    const locked = getLockedPaymentFields(initialData?.is_verified);
    const isLocked = (f: (typeof locked)[number]) => locked.includes(f);

    const form = useForm<PaymentFormData>({
        resolver: zodResolver(paymentFormSchema),
        defaultValues: {
            resident_id: initialData?.resident_id ?? residentId ?? '',
            house_id: initialData?.house_id ?? undefined,
            amount: initialData?.amount ? Number(initialData.amount) : 0,
            payment_date: initialData?.payment_date ? new Date(initialData.payment_date) : new Date(),
            status: initialData?.status ?? 'pending',
            method: initialData?.method ?? 'bank_transfer',
            reference_number: initialData?.reference_number ?? '',
            notes: initialData?.notes ?? '',
            period_start: initialData?.period_start ? new Date(initialData.period_start) : undefined,
            period_end: initialData?.period_end ? new Date(initialData.period_end) : undefined,
            charge_category: initialData?.charge_category ?? DEFAULT_CHARGE_CATEGORY,
            paid_by_resident_id: initialData?.paid_by_resident_id ?? null,
            paid_by_name: initialData?.paid_by_name ?? '',
        },
    });

    // Watch the resident_id to fetch their properties
    const watchedResidentId = useWatch({ control: form.control, name: 'resident_id' });
    const { data: propertiesData, isLoading: propertiesLoading } = useResidentPropertiesForPayment(watchedResidentId);

    // Auto-set house_id to current property if only one exists (and not editing)
    React.useEffect(() => {
        if (!isEditing && propertiesData?.data && propertiesData.data.length > 0) {
            const currentProperty = propertiesData.data.find(p => p.isCurrent);
            if (currentProperty && !form.getValues('house_id')) {
                form.setValue('house_id', currentProperty.houseId);
            }
        }
    }, [propertiesData, isEditing, form]);

    const showPropertySelector = !isEditing && propertiesData?.hasPreviousPropertyDebts;
    const properties = propertiesData?.data ?? [];

    async function onSubmit(data: PaymentFormData) {
        setSubmitState('loading');
        try {
            if (isEditing) {
                // The category changes only through Change category on the payment page (#1190).
                const { charge_category: _chargeCategory, ...edits } = data;
                void _chargeCategory;
                await updateMutation.mutateAsync({ id: initialData.id, data: edits });
                toast.success('Payment updated');
            } else {
                await createMutation.mutateAsync(data);
                toast.success('Payment recorded');
            }
            setSubmitState('success');

            // Hold for 600ms to show success, then navigate
            setTimeout(() => {
                onSuccess?.();
                router.push('/payments');
            }, 600);
        } catch (error) {
            setSubmitState('idle');
            toast.error(error instanceof Error ? error.message : 'Failed to save payment');
        }
    }

    const residents = residentsData?.data ?? [];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">

                {locked.length > 0 && (
                    <div role="note" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                        <span>{VERIFIED_LOCK_MESSAGE}</span>
                    </div>
                )}

                <FormField
                    control={form.control}
                    name="resident_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Resident *</FormLabel>
                            <Select
                                onValueChange={(value) => {
                                    field.onChange(value);
                                    // Reset house_id when resident changes
                                    form.setValue('house_id', undefined);
                                }}
                                defaultValue={field.value}
                                disabled={isEditing || isLocked('resident_id') || !!residentId || residentsLoading}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select resident" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {residents.map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.first_name} {r.last_name} ({r.resident_code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Property Selector - shown when resident has outstanding debts at previous properties */}
                {watchedResidentId && propertiesLoading && (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                )}

                {showPropertySelector && (
                    <FormField
                        control={form.control}
                        name="house_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                    <Home className="h-4 w-4" />
                                    Allocate to Property
                                </FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value || undefined}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select property" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {properties.map((property) => (
                                            <SelectItem key={property.houseId} value={property.houseId}>
                                                <div className="flex items-center justify-between w-full gap-4">
                                                    <div className="flex items-center gap-2">
                                                        {property.isCurrent && (
                                                            <MapPin className="h-3 w-3 text-primary" />
                                                        )}
                                                        {!property.isCurrent && (property.debtStatus === 'outstanding' || property.debtStatus === 'arrears') && (
                                                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                        )}
                                                        <span>{property.houseNumber} {property.streetName}</span>
                                                        {property.isCurrent && (
                                                            <Badge variant="outline" className="text-xs py-0">Current</Badge>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        {property.debtStatusLabel}
                                                        {property.outstandingAmount > 0 && ` · ${formatCurrency(property.outstandingAmount)}`}
                                                    </span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    A previous property has an owed balance
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Amount (₦) *</FormLabel>
                                <FormControl>
                                    <CurrencyInput
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        disabled={isLocked('amount')}
                                        placeholder="0.00"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="payment_date"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Payment Date *</FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => field.onChange(e.target.valueAsDate)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLocked('status')}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="paid">Paid</SelectItem>
                                        <SelectItem value="overdue">Overdue</SelectItem>
                                        <SelectItem value="failed">Failed</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="method"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Method</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select method" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="pos">POS</SelectItem>
                                        <SelectItem value="cheque">Cheque</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="charge_category"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Payment for</FormLabel>
                                <ChargeCategorySelect
                                    value={field.value ?? DEFAULT_CHARGE_CATEGORY}
                                    onChange={field.onChange}
                                    disabled={isEditing}
                                />
                                <FormDescription>
                                    {isEditing
                                        ? 'Use Change category on this page to move the money to another wallet'
                                        : 'The wallet this payment credits. It pays only invoices of this category'}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="paid_by_resident_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Paid by</FormLabel>
                                <Select
                                    onValueChange={(value) => field.onChange(value === PAID_BY_SELF ? null : value)}
                                    value={field.value || PAID_BY_SELF}
                                    disabled={residentsLoading}
                                >
                                    <FormControl>
                                        <SelectTrigger aria-label="Paid by">
                                            <SelectValue placeholder="The resident above" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value={PAID_BY_SELF}>The resident above</SelectItem>
                                        {residents.map((r) => (
                                            <SelectItem key={r.id} value={r.id}>
                                                {r.first_name} {r.last_name} ({r.resident_code})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="paid_by_name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Payer name (Optional)</FormLabel>
                            <FormControl>
                                <Input placeholder="Name on the transfer, if not a resident" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="reference_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reference Number</FormLabel>
                            <FormControl>
                                <Input placeholder="Bank ref, Receipt #, etc." {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="period_start"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Period Start (Optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => field.onChange(e.target.valueAsDate)}
                                    />
                                </FormControl>
                                <FormDescription>For service charge period coverage</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="period_end"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Period End (Optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="date"
                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => field.onChange(e.target.valueAsDate)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Additional details..."
                                    className="min-h-[100px]"
                                    {...field}
                                    value={field.value || ''}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex gap-4">
                    <Button
type="submit"
                    disabled={submitState !== 'idle'}
                    className={cn(
                        "min-w-[160px] transition-all duration-300 btn-hover-lift",
                        submitState === 'success' && "btn-success-state success-glow"
                    )}
                    >
                        <AnimatePresence mode="wait">
                            {submitState === 'loading' && (
                                <motion.span
                                    key="loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-2"
                                >
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving...
                                </motion.span>
                            )}
                            {submitState === 'success' && (
                                <motion.span
                                    key="success"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                    className="flex items-center gap-2"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    {isEditing ? 'Updated!' : 'Recorded!'}
                                </motion.span>
                            )}
                            {submitState === 'idle' && (
                                <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    {isEditing ? 'Update Payment' : 'Record Payment'}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitState !== 'idle'}>
                        Cancel
                    </Button>
                </div>
            </form>
        </Form>
    );
}
