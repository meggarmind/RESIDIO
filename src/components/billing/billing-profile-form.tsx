'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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

import { Trash2, Plus } from 'lucide-react';
import { useCreateBillingProfile } from '@/hooks/use-billing';
import { useRouter } from 'next/navigation';
import { BILLABLE_ROLE_OPTIONS, BILLING_TARGET_LABELS, type BillableRole, type BillingTargetType } from '@/types/database';

const createProfileSchema = z.object({
    name: z.string().min(1, 'Profile name is required'),
    description: z.string().optional(),
    is_active: z.boolean(),
    target_type: z.enum(['house', 'resident']),
    applicable_roles: z.array(z.enum(['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])).optional().nullable(),
    is_one_time: z.boolean(),
    is_development_levy: z.boolean(),
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
).refine(
    (data) => {
        // Development Levy must be a one-time profile
        if (data.is_development_levy) {
            return data.is_one_time === true;
        }
        return true;
    },
    {
        message: 'Development Levy must be a one-time profile',
        path: ['is_development_levy'],
    }
);

type FormValues = z.infer<typeof createProfileSchema>;

export function BillingProfileForm({ onSuccess }: { onSuccess?: () => void }) {
    const createMutation = useCreateBillingProfile();
    const router = useRouter();

    const form = useForm<FormValues>({
        resolver: zodResolver(createProfileSchema),
        defaultValues: {
            name: '',
            description: '',
            is_active: true,
            target_type: 'house',
            applicable_roles: null,
            is_one_time: false,
            is_development_levy: false,
            items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }]
        }
    });

    const targetType = form.watch('target_type');
    const isOneTime = form.watch('is_one_time');

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    async function onSubmit(data: FormValues) {
        try {
            await createMutation.mutateAsync(data);
            form.reset();
            onSuccess?.();
            router.refresh();
        } catch (error) {
            // Error handled by hook
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4 border p-4 rounded-md bg-slate-50/50">
                    <h3 className="font-medium">Profile Details</h3>
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
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                    <FormDescription>
                                        Who should this billing profile apply to?
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="is_one_time"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-6">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={(checked) => {
                                                field.onChange(checked);
                                                // Reset is_development_levy when unchecking one-time
                                                if (!checked) {
                                                    form.setValue('is_development_levy', false);
                                                }
                                            }}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>One-Time Levy</FormLabel>
                                        <FormDescription>
                                            Charged once per property (e.g., development levy)
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>

                    {isOneTime && (
                        <FormField
                            control={form.control}
                            name="is_development_levy"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-md bg-blue-50/50">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>This is a Development Levy</FormLabel>
                                        <FormDescription>
                                            Development Levies are a flat fee per house and only apply to property owners (landlords/developers).
                                            Can be set as the &quot;Current&quot; Development Levy for new houses.
                                        </FormDescription>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
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
                        <p className="text-sm font-medium text-destructive">{form.formState.errors.items.root?.message}</p>
                    )}
                </div>

                <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Profile'}
                </Button>
            </form>
        </Form>
    );
}
