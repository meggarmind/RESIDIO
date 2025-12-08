'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const billingItemSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    amount: z.coerce.number().min(0, 'Amount must be positive'),
    frequency: z.enum(['monthly', 'yearly', 'one_off']),
    is_mandatory: z.boolean().default(true),
});

const billingProfileSchema = z.object({
    name: z.string().min(1, 'Profile name is required'),
    description: z.string().optional(),
    is_active: z.boolean().default(true),
    items: z.array(billingItemSchema).optional(),
});

export type BillingProfileData = z.infer<typeof billingProfileSchema>;

export async function createBillingProfile(data: BillingProfileData) {
    const supabase = await createServerSupabaseClient();

    // 1. Validate
    const result = billingProfileSchema.safeParse(data);
    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() };
    }

    // 2. Create Profile
    const { data: profile, error: profileError } = await supabase
        .from('billing_profiles')
        .insert({
            name: result.data.name,
            description: result.data.description,
            is_active: result.data.is_active,
        })
        .select()
        .single();

    if (profileError) {
        console.error('Create profile error:', profileError);
        return { error: 'Failed to create billing profile' };
    }

    // 3. Create Items if any
    if (result.data.items && result.data.items.length > 0) {
        const itemsToInsert = result.data.items.map(item => ({
            billing_profile_id: profile.id,
            ...item
        }));

        const { error: itemsError } = await supabase
            .from('billing_items')
            .insert(itemsToInsert);

        if (itemsError) {
            console.error('Create items error:', itemsError);
            // Optional: Logic to rollback profile creation?
            return { error: 'Created profile but failed to add items' };
        }
    }

    revalidatePath('/settings/billing');
    return { success: true, data: profile };
}

export async function getBillingProfiles() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('billing_profiles')
        .select(`
            *,
            items:billing_items(*)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch profiles error:', error);
        return { error: 'Failed to fetch profiles', data: [] };
    }

    return { data, error: null };
}

export async function deleteBillingProfile(id: string) {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('billing_profiles')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Delete profile error:', error);
        return { error: 'Failed to delete profile' };
    }

    revalidatePath('/settings/billing');
    return { success: true };
}
