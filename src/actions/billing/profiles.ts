'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { billingProfileSchema, type BillingProfileData } from '@/lib/validators/billing';
import { createApprovalRequest, canAutoApprove } from '@/actions/approvals';
import type { BillingProfileWithItems } from '@/types/database';

export { type BillingProfileData } from '@/lib/validators/billing';

// Response types
interface UpdateBillingProfileResponse {
    success: boolean;
    approval_required?: boolean;
    request_id?: string;
    error?: string;
}

export async function createBillingProfile(data: BillingProfileData) {
    const supabase = await createServerSupabaseClient();

    // 1. Validate
    const result = billingProfileSchema.safeParse(data);
    if (!result.success) {
        return { error: 'Invalid data', details: result.error.flatten() };
    }

    // 2. Create Profile with new fields
    const { data: profile, error: profileError } = await supabase
        .from('billing_profiles')
        .insert({
            name: result.data.name,
            description: result.data.description || null,
            is_active: result.data.is_active,
            target_type: result.data.target_type,
            applicable_roles: result.data.applicable_roles || null,
            is_one_time: result.data.is_one_time,
            is_development_levy: result.data.is_development_levy || false,
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

/**
 * Gets all Development Levy billing profiles
 */
export async function getDevelopmentLevyProfiles() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('billing_profiles')
        .select(`
            *,
            items:billing_items(*)
        `)
        .eq('is_development_levy', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch Development Levy profiles error:', error);
        return { error: 'Failed to fetch Development Levy profiles', data: [] };
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

// Get a single billing profile by ID
export async function getBillingProfile(id: string): Promise<{ data: BillingProfileWithItems | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('billing_profiles')
        .select(`
            *,
            items:billing_items(*)
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Fetch profile error:', error);
        return { data: null, error: 'Failed to fetch profile' };
    }

    return { data: data as BillingProfileWithItems, error: null };
}

// Check if effective_date change would affect existing invoices
export async function checkEffectiveDateImpact(
    profileId: string,
    newEffectiveDate: string
): Promise<{ affected_count: number; earliest_invoice_date: string | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Get the earliest invoice date for this billing profile
    const { data: earliestInvoice, error } = await supabase
        .from('invoices')
        .select('period_start')
        .eq('billing_profile_id', profileId)
        .order('period_start', { ascending: true })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        return { affected_count: 0, earliest_invoice_date: null, error: error.message };
    }

    if (!earliestInvoice) {
        // No invoices exist, no impact
        return { affected_count: 0, earliest_invoice_date: null, error: null };
    }

    // Check if new effective date is earlier than earliest invoice
    const newDate = new Date(newEffectiveDate);
    const earliestDate = new Date(earliestInvoice.period_start);

    if (newDate >= earliestDate) {
        // New date is not earlier, no impact
        return { affected_count: 0, earliest_invoice_date: earliestInvoice.period_start, error: null };
    }

    // Count affected invoices (those with period_start after new effective date but before current)
    const { count, error: countError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('billing_profile_id', profileId)
        .gte('period_start', newEffectiveDate);

    if (countError) {
        return { affected_count: 0, earliest_invoice_date: null, error: countError.message };
    }

    return {
        affected_count: count || 0,
        earliest_invoice_date: earliestInvoice.period_start,
        error: null,
    };
}

// Update billing profile
export async function updateBillingProfile(
    id: string,
    data: Partial<BillingProfileData> & { effective_date?: string }
): Promise<UpdateBillingProfileResponse> {
    const supabase = await createServerSupabaseClient();

    // Get current profile
    const { data: currentProfile, error: fetchError } = await supabase
        .from('billing_profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !currentProfile) {
        return { success: false, error: 'Profile not found' };
    }

    // Check if effective_date is being changed to an earlier date
    const isEffectiveDateChange =
        data.effective_date &&
        data.effective_date !== currentProfile.effective_date;

    if (isEffectiveDateChange) {
        // Check impact on existing invoices
        const impact = await checkEffectiveDateImpact(id, data.effective_date!);

        if (impact.affected_count > 0) {
            // Check if user can auto-approve
            const autoApprove = await canAutoApprove();

            if (!autoApprove) {
                // Create approval request instead of applying directly
                const result = await createApprovalRequest({
                    request_type: 'billing_profile_effective_date',
                    entity_type: 'billing_profile',
                    entity_id: id,
                    requested_changes: { effective_date: data.effective_date },
                    current_values: { effective_date: currentProfile.effective_date },
                    reason: `Changing effective date would affect ${impact.affected_count} existing invoice(s)`,
                });

                if (!result.success) {
                    return { success: false, error: result.error || 'Failed to create approval request' };
                }

                return {
                    success: true,
                    approval_required: true,
                    request_id: result.request_id,
                };
            }
        }
    }

    // Apply the update directly (either no impact or user can auto-approve)
    const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.target_type !== undefined) updateData.target_type = data.target_type;
    if (data.applicable_roles !== undefined) updateData.applicable_roles = data.applicable_roles || null;
    if (data.is_one_time !== undefined) updateData.is_one_time = data.is_one_time;
    if (data.is_development_levy !== undefined) updateData.is_development_levy = data.is_development_levy;
    if (data.effective_date !== undefined) updateData.effective_date = data.effective_date;

    const { error: updateError } = await supabase
        .from('billing_profiles')
        .update(updateData)
        .eq('id', id);

    if (updateError) {
        console.error('Update profile error:', updateError);
        return { success: false, error: 'Failed to update profile' };
    }

    // Update items if provided
    if (data.items) {
        // Delete existing items
        await supabase.from('billing_items').delete().eq('billing_profile_id', id);

        // Insert new items
        if (data.items.length > 0) {
            const itemsToInsert = data.items.map(item => ({
                billing_profile_id: id,
                ...item,
            }));

            const { error: itemsError } = await supabase
                .from('billing_items')
                .insert(itemsToInsert);

            if (itemsError) {
                console.error('Update items error:', itemsError);
                return { success: false, error: 'Updated profile but failed to update items' };
            }
        }
    }

    revalidatePath('/settings/billing');
    return { success: true };
}

/**
 * Duplicates a billing profile with all its items
 * Creates a copy with name "Copy of {original}"
 */
export async function duplicateBillingProfile(id: string) {
    const supabase = await createServerSupabaseClient();

    // 1. Get source profile with items
    const { data: source, error: fetchError } = await supabase
        .from('billing_profiles')
        .select(`
            *,
            items:billing_items(*)
        `)
        .eq('id', id)
        .single();

    if (fetchError || !source) {
        console.error('Fetch source profile error:', fetchError);
        return { error: 'Source profile not found' };
    }

    // 2. Create duplicate profile with "Copy of" prefix
    const { data: newProfile, error: profileError } = await supabase
        .from('billing_profiles')
        .insert({
            name: `Copy of ${source.name}`,
            description: source.description,
            is_active: source.is_active,
            target_type: source.target_type,
            applicable_roles: source.applicable_roles,
            is_one_time: source.is_one_time,
            is_development_levy: source.is_development_levy,
            effective_date: source.effective_date,
        })
        .select()
        .single();

    if (profileError || !newProfile) {
        console.error('Create duplicate profile error:', profileError);
        return { error: 'Failed to create duplicate profile' };
    }

    // 3. Copy billing items
    if (source.items && source.items.length > 0) {
        const itemsToInsert = source.items.map((item: { name: string; amount: number; frequency: string; is_mandatory: boolean }) => ({
            billing_profile_id: newProfile.id,
            name: item.name,
            amount: item.amount,
            frequency: item.frequency,
            is_mandatory: item.is_mandatory,
        }));

        const { error: itemsError } = await supabase
            .from('billing_items')
            .insert(itemsToInsert);

        if (itemsError) {
            console.error('Copy items error:', itemsError);
            // Still return success but with warning
            return {
                success: true,
                data: newProfile,
                warning: 'Duplicated profile but some items may not have copied'
            };
        }
    }

    revalidatePath('/settings/billing');
    return { success: true, data: newProfile };
}
