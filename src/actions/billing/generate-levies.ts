'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { debitWalletForInvoice } from '@/actions/billing/wallet';
import type { BillableRole, RateSnapshot } from '@/types/database';

interface LevyGenerationResult {
    success: boolean;
    generated: number;
    skipped: number;
    errors: string[];
}

interface BillingProfileWithItems {
    id: string;
    name: string;
    target_type: 'house' | 'resident';
    applicable_roles: BillableRole[] | null;
    is_one_time: boolean;
    is_development_levy: boolean;
    billing_items?: Array<{
        id: string;
        name: string;
        amount: number;
        frequency: string;
        is_mandatory: boolean;
    }>;
}

/**
 * Gets the system setting value
 */
async function getSystemSetting(supabase: any, key: string): Promise<any> {
    const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();

    if (data?.value) {
        if (typeof data.value === 'string') {
            if (data.value === 'true') return true;
            if (data.value === 'false') return false;
            return data.value;
        }
        return data.value;
    }
    return null;
}

/**
 * Builds a rate snapshot from a billing profile for audit trail
 */
function buildRateSnapshot(
    billingProfile: BillingProfileWithItems,
    totalAmount: number,
    options?: { isDevelopmentLevy?: boolean }
): RateSnapshot & { is_development_levy?: boolean } {
    const snapshot: RateSnapshot & { is_development_levy?: boolean } = {
        billing_profile_id: billingProfile.id,
        billing_profile_name: billingProfile.name,
        captured_at: new Date().toISOString(),
        items: billingProfile.billing_items?.map(item => ({
            name: item.name,
            amount: item.amount,
            frequency: item.frequency,
            is_mandatory: item.is_mandatory,
        })) || [],
        total_amount: totalAmount,
    };

    // Mark as Development Levy in snapshot for audit trail
    if (options?.isDevelopmentLevy) {
        snapshot.is_development_levy = true;
    }

    return snapshot;
}

/**
 * Generates one-time levies for a specific house.
 * Called when a house is created or when retroactively applying levies.
 *
 * Logic:
 * 1. Find all active one-time billing profiles
 * 2. For each profile, check if it applies to the primary resident's role
 * 3. If not already applied (check house_levy_history), generate invoice
 * 4. Record in house_levy_history
 */
export async function generateLeviesForHouse(
    houseId: string,
    residentId?: string
): Promise<LevyGenerationResult> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, generated: 0, skipped: 0, errors: ['Unauthorized'] };
    }

    const result: LevyGenerationResult = {
        success: true,
        generated: 0,
        skipped: 0,
        errors: [],
    };

    try {
        // Check if auto levy generation is enabled
        const autoGenerateLevies = await getSystemSetting(supabase, 'auto_generate_levies');
        if (autoGenerateLevies === false) {
            console.log('[Levies] Auto levy generation is disabled');
            return result;
        }

        // Get due window setting for calculating due dates
        const dueWindowSetting = await getSystemSetting(supabase, 'invoice_due_window_days');
        const dueWindowDays = parseInt(String(dueWindowSetting).replace(/"/g, '')) || 30;

        // Get house details including number_of_plots
        const { data: house, error: houseError } = await supabase
            .from('houses')
            .select('id, house_number, number_of_plots, street:streets(name)')
            .eq('id', houseId)
            .single();

        if (houseError || !house) {
            result.errors.push('House not found');
            result.success = false;
            return result;
        }

        const houseLabel = house.house_number;

        // Find the primary resident for this house if not provided
        let targetResidentId = residentId;
        let targetResidentRole: BillableRole | null = null;

        if (!targetResidentId) {
            const { data: residentLink } = await supabase
                .from('resident_houses')
                .select('resident_id, resident_role')
                .eq('house_id', houseId)
                .eq('is_active', true)
                .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'developer', 'tenant'])
                .order('resident_role', { ascending: true }) // tenant first, then resident_landlord, etc.
                .limit(1)
                .single();

            if (!residentLink) {
                console.log(`[Levies] No primary resident found for house ${houseLabel}`);
                return result;
            }

            targetResidentId = residentLink.resident_id;
            targetResidentRole = residentLink.resident_role as BillableRole;
        } else {
            // Get the role for the provided resident
            const { data: residentLink } = await supabase
                .from('resident_houses')
                .select('resident_role')
                .eq('house_id', houseId)
                .eq('resident_id', targetResidentId)
                .eq('is_active', true)
                .single();

            if (residentLink) {
                targetResidentRole = residentLink.resident_role as BillableRole;
            }
        }

        if (!targetResidentId || !targetResidentRole) {
            console.log(`[Levies] Cannot determine billable resident for house ${houseLabel}`);
            return result;
        }

        // Get all active one-time billing profiles
        const { data: oneTimeProfiles, error: profilesError } = await supabase
            .from('billing_profiles')
            .select(`
                id, name, target_type, applicable_roles, is_one_time, is_development_levy,
                billing_items(id, name, amount, frequency, is_mandatory)
            `)
            .eq('is_active', true)
            .eq('is_one_time', true);

        if (profilesError) {
            result.errors.push(`Failed to fetch billing profiles: ${profilesError.message}`);
            result.success = false;
            return result;
        }

        if (!oneTimeProfiles || oneTimeProfiles.length === 0) {
            console.log('[Levies] No one-time billing profiles found');
            return result;
        }

        console.log(`[Levies] Found ${oneTimeProfiles.length} one-time profiles for house ${houseLabel}`);

        // Check which profiles apply to this resident's role
        for (const profile of oneTimeProfiles as BillingProfileWithItems[]) {
            try {
                // Check if this is a Development Levy (use flag, fallback to name for backward compatibility)
                const isDevelopmentLevy = profile.is_development_levy === true ||
                    profile.name.toLowerCase().includes('development');

                // Development Levy only applies to landlords and developers, NOT tenants
                if (isDevelopmentLevy && targetResidentRole === 'tenant') {
                    console.log(`[Levies] Skipping Development Levy for tenant in house ${houseLabel}`);
                    result.skipped++;
                    continue;
                }

                // Check if profile applies to this role
                if (profile.target_type === 'resident' && profile.applicable_roles) {
                    if (!profile.applicable_roles.includes(targetResidentRole)) {
                        result.skipped++;
                        continue;
                    }
                }

                // Check if already applied (house_levy_history)
                const { data: existingLevy } = await supabase
                    .from('house_levy_history')
                    .select('id')
                    .eq('house_id', houseId)
                    .eq('billing_profile_id', profile.id)
                    .maybeSingle();

                if (existingLevy) {
                    result.skipped++;
                    continue;
                }

                // Calculate total amount
                const items = profile.billing_items || [];
                const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);

                // NOTE: Development Levy is a FLAT FEE per house, NOT multiplied by plots
                // The plot multiplication was removed as it was incorrect behavior

                if (totalAmount === 0) {
                    result.skipped++;
                    continue;
                }

                // Generate invoice number
                const now = new Date();
                const invoiceNumber = `LEV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${houseId.substring(0, 8).toUpperCase()}`;

                // Calculate due date using window-based approach
                const dueDate = new Date(now);
                dueDate.setDate(dueDate.getDate() + dueWindowDays);

                // Build rate snapshot for audit trail
                const rateSnapshot = buildRateSnapshot(profile, totalAmount, {
                    isDevelopmentLevy,
                });

                // Create invoice with invoice_type='LEVY' and rate_snapshot
                const { data: newInvoice, error: invoiceError } = await supabase
                    .from('invoices')
                    .insert({
                        resident_id: targetResidentId,
                        house_id: houseId,
                        billing_profile_id: profile.id,
                        invoice_number: invoiceNumber,
                        amount_due: totalAmount,
                        amount_paid: 0,
                        status: 'unpaid',
                        invoice_type: 'LEVY' as const,
                        rate_snapshot: rateSnapshot,
                        due_date: dueDate.toISOString().split('T')[0],
                        period_start: now.toISOString().split('T')[0],
                        period_end: now.toISOString().split('T')[0],
                        created_by: user.id,
                    })
                    .select()
                    .single();

                if (invoiceError) {
                    result.errors.push(`Levy invoice for ${profile.name}: ${invoiceError.message}`);
                    continue;
                }

                // Create invoice items
                const invoiceItems = items.map(item => ({
                    invoice_id: newInvoice.id,
                    description: item.name,
                    amount: item.amount,
                }));

                if (invoiceItems.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('invoice_items')
                        .insert(invoiceItems);

                    if (itemsError) {
                        result.errors.push(`Levy items for ${profile.name}: ${itemsError.message}`);
                    }
                }

                // Record in house_levy_history
                const { error: historyError } = await supabase
                    .from('house_levy_history')
                    .insert({
                        house_id: houseId,
                        billing_profile_id: profile.id,
                        resident_id: targetResidentId,
                        invoice_id: newInvoice.id,
                        applied_by: user.id,
                        notes: `Auto-generated levy: ${profile.name}`,
                    });

                if (historyError) {
                    console.error(`[Levies] Failed to record levy history: ${historyError.message}`);
                }

                result.generated++;
                console.log(`[Levies] Generated levy "${profile.name}" for house ${houseLabel}`);

                // Try to auto-debit from wallet
                const debitResult = await debitWalletForInvoice(targetResidentId, newInvoice.id);
                if (debitResult.success && debitResult.amountDebited > 0) {
                    console.log(`[Levies] Auto-debited ₦${debitResult.amountDebited} from wallet for ${invoiceNumber}`);
                }

            } catch (profileError: any) {
                result.errors.push(`Profile ${profile.name}: ${profileError.message}`);
            }
        }

    } catch (error: any) {
        result.success = false;
        result.errors.push(`Unexpected error: ${error.message}`);
    }

    revalidatePath('/billing');
    return result;
}

/**
 * Generates retroactive levies for all existing houses that haven't had them applied.
 * This is an admin action to backfill levies for houses created before certain profiles existed.
 */
export async function generateRetroactiveLevies(): Promise<LevyGenerationResult> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, generated: 0, skipped: 0, errors: ['Unauthorized'] };
    }

    const result: LevyGenerationResult = {
        success: true,
        generated: 0,
        skipped: 0,
        errors: [],
    };

    try {
        // Get all active houses
        const { data: houses, error: housesError } = await supabase
            .from('houses')
            .select('id, house_number')
            .eq('is_active', true);

        if (housesError) {
            result.errors.push(`Failed to fetch houses: ${housesError.message}`);
            result.success = false;
            return result;
        }

        console.log(`[Levies] Processing retroactive levies for ${houses?.length || 0} houses`);

        for (const house of houses || []) {
            const houseResult = await generateLeviesForHouse(house.id);
            result.generated += houseResult.generated;
            result.skipped += houseResult.skipped;
            result.errors.push(...houseResult.errors);
        }

        console.log(`[Levies] Retroactive: Generated=${result.generated}, Skipped=${result.skipped}`);

    } catch (error: any) {
        result.success = false;
        result.errors.push(`Unexpected error: ${error.message}`);
    }

    revalidatePath('/billing');
    return result;
}
