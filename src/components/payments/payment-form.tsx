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
import { useResidents } from '@/hooks/use-residents';
import { paymentFormSchema, type PaymentFormData } from '@/lib/validators/payment';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';
import { Home, AlertTriangle, MapPin } from 'lucide-react';

interface PaymentFormProps {
    initialData?: any;
    residentId?: string;
    onSuccess?: () => void;
}

export function PaymentForm({ initialData, residentId, onSuccess }: PaymentFormProps) {
    const router = useRouter();
    const createMutation = useCreatePayment();
    const updateMutation = useUpdatePayment();
    const { data: residentsData, isLoading: residentsLoading } = useResidents({ limit: 1000 });

    const isEditing = !!initialData;
    const isLoading = createMutation.isPending || updateMutation.isPending;

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
        try {
            if (isEditing) {
                // @ts-ignore
                await updateMutation.mutateAsync({ id: initialData.id, data });
                toast.success('Payment updated');
            } else {
                await createMutation.mutateAsync(data);
                toast.success('Payment recorded');
            }
            onSuccess?.();
            router.push('/payments');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to save payment');
        }
    }

    const residents = residentsData?.data ?? [];

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">

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
                                disabled={isEditing || !!residentId || residentsLoading}
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
                                                        {!property.isCurrent && property.outstandingAmount > 0 && (
                                                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                        )}
                                                        <span>{property.houseNumber} {property.streetName}</span>
                                                        {property.isCurrent && (
                                                            <Badge variant="outline" className="text-xs py-0">Current</Badge>
                                                        )}
                                                    </div>
                                                    {property.outstandingAmount > 0 && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatCurrency(property.outstandingAmount)} due
                                                        </span>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormDescription className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    Outstanding balances exist at previous properties
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
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Saving...' : isEditing ? 'Update Payment' : 'Record Payment'}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancel
                    </Button>
                </div>
            </form>
        </Form>
    );
}
