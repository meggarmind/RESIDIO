'use client';

import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';
import { useBillingProfile, useUpdateBillingProfile, useCheckEffectiveDateImpact } from '@/hooks/use-billing';
import { BILLABLE_ROLE_OPTIONS, BILLING_TARGET_LABELS, type BillingProfileWithItems } from '@/types/database';

const editProfileSchema = z.object({
    name: z.string().min(1, 'Profile name is required'),
    description: z.string().optional(),
    is_active: z.boolean(),
    target_type: z.enum(['house', 'resident']),
    applicable_roles: z.array(z.enum(['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])).optional().nullable(),
    is_one_time: z.boolean(),
    effective_date: z.string().optional(),
    items: z.array(z.object({
        name: z.string().min(1, 'Item name is required'),
        amount: z.number().min(0, 'Amount must be positive'),
        frequency: z.enum(['monthly', 'yearly', 'one_off']),
        is_mandatory: z.boolean(),
    })).min(1, "At least one billing item is required"),
}).refine(
    (data) => {
        if (data.target_type === 'resident') {
            return data.applicable_roles && data.applicable_roles.length > 0;
        }
        return true;
    },
    {
        message: 'At least one role must be selected for resident-targeted profiles',
        path: ['applicable_roles'],
    }
);

type FormValues = z.infer<typeof editProfileSchema>;

interface BillingProfileEditDialogProps {
    profileId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BillingProfileEditDialog({
    profileId,
    open,
    onOpenChange,
}: BillingProfileEditDialogProps) {
    const { data: profile, isLoading } = useBillingProfile(profileId || undefined);
    const updateMutation = useUpdateBillingProfile();

    const form = useForm<FormValues>({
        resolver: zodResolver(editProfileSchema),
        defaultValues: {
            name: '',
            description: '',
            is_active: true,
            target_type: 'house',
            applicable_roles: null,
            is_one_time: false,
            effective_date: '',
            items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }]
        }
    });

    const targetType = form.watch('target_type');
    const effectiveDate = form.watch('effective_date');

    // Check impact of effective date change
    const { data: dateImpact } = useCheckEffectiveDateImpact(
        profileId || undefined,
        effectiveDate
    );

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Reset form when profile data loads
    useEffect(() => {
        if (profile) {
            form.reset({
                name: profile.name,
                description: profile.description || '',
                is_active: profile.is_active,
                target_type: profile.target_type as 'house' | 'resident',
                applicable_roles: profile.applicable_roles || null,
                is_one_time: profile.is_one_time,
                effective_date: profile.effective_date || '',
                items: profile.items?.map(item => ({
                    name: item.name,
                    amount: item.amount,
                    frequency: item.frequency as 'monthly' | 'yearly' | 'one_off',
                    is_mandatory: item.is_mandatory,
                })) || [{ name: '', amount: 0, frequency: 'monthly', is_mandatory: true }],
            });
        }
    }, [profile, form]);

    async function onSubmit(data: FormValues) {
        if (!profileId) return;

        try {
            await updateMutation.mutateAsync({ id: profileId, data });
            onOpenChange(false);
        } catch {
            // Error handled by hook
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Billing Profile</DialogTitle>
                    <DialogDescription>
                        Update the billing profile details and items.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Profile Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Standard 3-Bed Rate" {...field} />
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
                                            <FormLabel>Description (Optional)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="For standard 3 bedroom flats..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="target_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Billing Target</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select target type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {Object.entries(BILLING_TARGET_LABELS).map(([value, label]) => (
                                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="is_active"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>Active</FormLabel>
                                                    <FormDescription>
                                                        Enable this billing profile
                                                    </FormDescription>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="is_one_time"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                </FormControl>
                                                <div className="space-y-1 leading-none">
                                                    <FormLabel>One-Time Levy</FormLabel>
                                                    <FormDescription>
                                                        Charged once per property
                                                    </FormDescription>
                                                </div>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="effective_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Effective Date</FormLabel>
                                                <FormControl>
                                                    <Input type="date" {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    When this rate becomes active
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {dateImpact && dateImpact.affected_count > 0 && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription>
                                            Changing the effective date will affect {dateImpact.affected_count} existing invoice(s).
                                            This change will require approval.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {targetType === 'resident' && (
                                    <FormField
                                        control={form.control}
                                        name="applicable_roles"
                                        render={() => (
                                            <FormItem>
                                                <FormLabel>Applicable Roles</FormLabel>
                                                <FormDescription>
                                                    Select which resident roles this billing profile applies to
                                                </FormDescription>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {BILLABLE_ROLE_OPTIONS.map((role) => (
                                                        <FormField
                                                            key={role.value}
                                                            control={form.control}
                                                            name="applicable_roles"
                                                            render={({ field }) => {
                                                                const currentRoles = field.value || [];
                                                                return (
                                                                    <FormItem
                                                                        key={role.value}
                                                                        className="flex flex-row items-start space-x-3 space-y-0"
                                                                    >
                                                                        <FormControl>
                                                                            <Checkbox
                                                                                checked={currentRoles.includes(role.value)}
                                                                                onCheckedChange={(checked) => {
                                                                                    const newRoles = checked
                                                                                        ? [...currentRoles, role.value]
                                                                                        : currentRoles.filter((r) => r !== role.value);
                                                                                    field.onChange(newRoles.length > 0 ? newRoles : null);
                                                                                }}
                                                                            />
                                                                        </FormControl>
                                                                        <Label className="font-normal cursor-pointer">
                                                                            {role.label}
                                                                        </Label>
                                                                    </FormItem>
                                                                );
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium">Billing Items</h3>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ name: '', amount: 0, frequency: 'monthly', is_mandatory: true })}
                                    >
                                        <Plus className="h-4 w-4 mr-2" /> Add Item
                                    </Button>
                                </div>

                                {fields.map((field, index) => (
                                    <div key={field.id} className="flex gap-4 items-end p-4 border rounded-md">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.name`}
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className={index !== 0 ? "sr-only" : ""}>Item Name</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="e.g. Security Fee" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.amount`}
                                            render={({ field }) => (
                                                <FormItem className="w-32">
                                                    <FormLabel className={index !== 0 ? "sr-only" : ""}>Amount (₦)</FormLabel>
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

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive mb-[2px]"
                                            onClick={() => remove(index)}
                                            disabled={fields.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                {form.formState.errors.items && (
                                    <p className="text-sm font-medium text-destructive">
                                        {form.formState.errors.items.root?.message}
                                    </p>
                                )}
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={updateMutation.isPending}>
                                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}
