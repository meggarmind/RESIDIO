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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Trash2, Plus } from 'lucide-react';
import { useCreateBillingProfile } from '@/hooks/use-billing';
import { useRouter } from 'next/navigation';

const createProfileSchema = z.object({
    name: z.string().min(1, 'Profile name is required'),
    description: z.string().optional(),
    is_active: z.boolean().default(true),
    items: z.array(z.object({
        name: z.string().min(1, 'Item name is required'),
        amount: z.coerce.number().min(0, 'Amount must be positive'),
        // Defaulting frequency to monthly for simplicity in UI for now
        frequency: z.enum(['monthly', 'yearly', 'one_off']).default('monthly'),
        is_mandatory: z.boolean().default(true),
    })).min(1, "At least one billing item is required"),
});

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
            items: [{ name: 'Security Dues', amount: 0, frequency: 'monthly', is_mandatory: true }]
        }
    });

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
                                            <Input type="number" {...field} />
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
