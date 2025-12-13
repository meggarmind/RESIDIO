'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { debitWalletForInvoice } from '@/actions/billing/wallet';
import type { BillableRole, RateSnapshot, InvoiceType } from '@/types/database';

interface SkipReason {
    house: string;
    reason: string;
}

interface GenerateInvoicesResult {
    success: boolean;
    generated: number;
    skipped: number;
    skipReasons: SkipReason[];
    errors: string[];
}

/**
 * Type for resident-house relationship with role information
 */
interface ResidentHouseLink {
    id: string;
    resident_id: string;
    resident_role: 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer' | 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker';
    is_active: boolean;
    move_in_date: string;
    resident: {
        id: string;
        first_name: string;
        last_name: string;
        resident_code: string;
    };
}

interface BillingProfileWithItems {
    id: string;
    name: string;
    target_type: 'house' | 'resident';
    applicable_roles: BillableRole[] | null;
    is_one_time: boolean;
    billing_items?: Array<{
        id: string;
        name: string;
        amount: number;
        frequency: string;
        is_mandatory: boolean;
    }>;
}

/**
 * Determines which resident should be billed for a house based on role priority.
 *
 * Business Rules (in order of priority):
 * 1. Tenant - ALWAYS billed if active (leaseholder who resides in the unit)
 * 2. Resident Landlord - Billed if no tenant (owner who lives in the property)
 * 3. Non-Resident Landlord - Billed if house is vacant (owner who doesn't live there)
 *
 * Roles that are NEVER billed:
 * - Developer - Only billed for developer-specific one-time levies
 * - Co-Resident - Adult residing but not on title/lease
 * - Household Member - Family dependents
 * - Domestic Staff - Employees
 * - Caretaker - Maintains vacant units
 */
function findBillableResident(residentHouses: ResidentHouseLink[], includeVacant: boolean = false): ResidentHouseLink | null {
    const activeResidents = residentHouses.filter(rh => rh.is_active);

    // Priority 1: Tenant (leaseholder)
    const tenant = activeResidents.find(rh => rh.resident_role === 'tenant');
    if (tenant) {
        return tenant;
    }

    // Priority 2: Resident Landlord (owner who lives there)
    const residentLandlord = activeResidents.find(rh => rh.resident_role === 'resident_landlord');
    if (residentLandlord) {
        return residentLandlord;
    }

    // Priority 3: Non-Resident Landlord (owner who doesn't live there - vacant house)
    // Only include if vacant house billing is enabled
    if (includeVacant) {
        const nonResidentLandlord = activeResidents.find(rh => rh.resident_role === 'non_resident_landlord');
        if (nonResidentLandlord) {
            return nonResidentLandlord;
        }
    }

    // No billable resident found
    // (e.g., only developer, co_resident, household_member, domestic_staff, or caretaker)
    return null;
}

/**
 * Gets the effective billing profile for a house.
 * Priority: House override > House Type default
 */
async function getEffectiveBillingProfile(
    supabase: any,
    house: { id: string; billing_profile_id: string | null; house_type_id: string | null }
): Promise<BillingProfileWithItems | null> {
    // If house has a direct override, use that
    if (house.billing_profile_id) {
        const { data: profile } = await supabase
            .from('billing_profiles')
            .select(`
                id, name, target_type, applicable_roles, is_one_time,
                billing_items(id, name, amount, frequency, is_mandatory)
            `)
            .eq('id', house.billing_profile_id)
            .eq('is_active', true)
            .single();

        return profile;
    }

    // Otherwise get from house type
    if (house.house_type_id) {
        const { data: houseType } = await supabase
            .from('house_types')
            .select(`
                billing_profile_id,
                billing_profile:billing_profiles(
                    id, name, target_type, applicable_roles, is_one_time,
                    billing_items(id, name, amount, frequency, is_mandatory)
                )
            `)
            .eq('id', house.house_type_id)
            .single();

        if (houseType?.billing_profile) {
            const profile = Array.isArray(houseType.billing_profile)
                ? houseType.billing_profile[0]
                : houseType.billing_profile;
            return profile;
        }
    }

    return null;
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
        // Value is stored as JSONB, but simple values are stored as strings
        if (typeof data.value === 'string') {
            // Try to parse boolean strings
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
    totalAmount: number
): RateSnapshot {
    return {
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
}

/**
 * Determines the invoice type based on billing profile
 */
function getInvoiceType(billingProfile: BillingProfileWithItems): InvoiceType {
    if (billingProfile.is_one_time) {
        return 'LEVY';
    }
    return 'SERVICE_CHARGE';
}

/**
 * Generates invoices for all houses with billing profiles.
 * For each house, generates invoices from the resident's move-in date to the current month.
 * Pro-rata applies only to the first (move-in) month; all subsequent months are full rate.
 *
 * Billing Logic:
 * 1. House-targeted profiles (target_type='house'): Bill the primary resident
 * 2. Resident-targeted profiles (target_type='resident'): Bill residents matching applicable_roles
 * 3. Vacant house billing: Controlled by system setting 'bill_vacant_houses'
 */
export async function generateMonthlyInvoices(
    upToDate: Date = new Date()
): Promise<GenerateInvoicesResult> {
    const supabase = await createServerSupabaseClient();

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, generated: 0, skipped: 0, skipReasons: [], errors: ['Unauthorized'] };
    }

    const result: GenerateInvoicesResult = {
        success: true,
        generated: 0,
        skipped: 0,
        skipReasons: [],
        errors: [],
    };

    // Current month boundaries (target end)
    const targetYear = upToDate.getFullYear();
    const targetMonth = upToDate.getMonth();

    console.log(`[Billing] Generating invoices up to: ${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`);

    try {
        // Get system settings
        const billVacantHouses = await getSystemSetting(supabase, 'bill_vacant_houses') === true;
        const dueWindowSetting = await getSystemSetting(supabase, 'invoice_due_window_days');
        const dueWindowDays = parseInt(String(dueWindowSetting).replace(/"/g, '')) || 30;
        console.log(`[Billing] Bill vacant houses: ${billVacantHouses}`);
        console.log(`[Billing] Due window days: ${dueWindowDays}`);

        // 1. Find all active houses (both occupied and vacant)
        const { data: houses, error: housesError } = await supabase
            .from('houses')
            .select(`
                id,
                house_number,
                house_type_id,
                billing_profile_id,
                is_occupied,
                street:streets(name)
            `)
            .eq('is_active', true);

        if (housesError) {
            result.errors.push(`Failed to fetch houses: ${housesError.message}`);
            result.success = false;
            return result;
        }

        console.log(`[Billing] Found ${houses?.length || 0} active houses`);

        for (const house of houses || []) {
            const houseLabel = `${house.house_number}`;

            try {
                // Get the effective billing profile (house override or house type default)
                const billingProfile = await getEffectiveBillingProfile(supabase, house);

                if (!billingProfile) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'No billing profile assigned' });
                    continue;
                }

                // Skip one-time profiles in monthly generation (handled separately)
                if (billingProfile.is_one_time) {
                    continue;
                }

                // Only process house-targeted profiles for now
                // Resident-targeted profiles need different handling
                if (billingProfile.target_type !== 'house') {
                    continue;
                }

                // 2. Find all active residents for this house
                const { data: allResidentLinks, error: residentError } = await supabase
                    .from('resident_houses')
                    .select(`
                        id,
                        resident_id,
                        resident_role,
                        is_active,
                        move_in_date,
                        resident:residents!resident_id(id, first_name, last_name, resident_code)
                    `)
                    .eq('house_id', house.id)
                    .eq('is_active', true);

                if (residentError) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: `Error fetching residents: ${residentError.message}` });
                    continue;
                }

                if (!allResidentLinks || allResidentLinks.length === 0) {
                    // Vacant house - check if we should bill
                    if (!billVacantHouses) {
                        result.skipped++;
                        result.skipReasons.push({ house: houseLabel, reason: 'Vacant (no active residents)' });
                        continue;
                    }
                }

                // Find billable resident using priority logic
                const residentLink = findBillableResident(
                    (allResidentLinks || []) as unknown as ResidentHouseLink[],
                    billVacantHouses
                );

                if (!residentLink) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'No billable resident found' });
                    continue;
                }

                // Get monthly billing items
                const monthlyItems = billingProfile.billing_items?.filter(
                    (item) => item.frequency === 'monthly'
                ) || [];

                if (monthlyItems.length === 0) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'Billing profile has no monthly items' });
                    continue;
                }

                const fullMonthTotal = monthlyItems.reduce(
                    (sum: number, item) => sum + (item.amount || 0),
                    0
                );

                // 3. Generate invoices from move-in date to target month
                const moveInDate = new Date(residentLink.move_in_date);
                const startYear = moveInDate.getFullYear();
                const startMonth = moveInDate.getMonth();

                // Loop through each month from move-in to target
                let currentYear = startYear;
                let currentMonth = startMonth;

                while (currentYear < targetYear || (currentYear === targetYear && currentMonth <= targetMonth)) {
                    const periodStart = new Date(currentYear, currentMonth, 1);
                    const periodEnd = new Date(currentYear, currentMonth + 1, 0); // Last day of month
                    const totalDaysInMonth = periodEnd.getDate();
                    // Calculate due date using window-based approach (days from period start)
                    const dueDate = new Date(periodStart);
                    dueDate.setDate(dueDate.getDate() + dueWindowDays);

                    const periodStartStr = periodStart.toISOString().split('T')[0];
                    const periodEndStr = periodEnd.toISOString().split('T')[0];

                    // Check for existing invoice (idempotency)
                    const { data: existingInvoice } = await supabase
                        .from('invoices')
                        .select('id')
                        .eq('resident_id', residentLink.resident_id)
                        .eq('house_id', house.id)
                        .eq('billing_profile_id', billingProfile.id)
                        .eq('period_start', periodStartStr)
                        .eq('period_end', periodEndStr)
                        .maybeSingle();

                    if (existingInvoice) {
                        // Already exists, move to next month
                        currentMonth++;
                        if (currentMonth > 11) {
                            currentMonth = 0;
                            currentYear++;
                        }
                        continue;
                    }

                    // Calculate pro-rata (only for move-in month)
                    const isFirstMonth = (currentYear === startYear && currentMonth === startMonth);
                    let fraction = 1;
                    let activeDays = totalDaysInMonth;

                    if (isFirstMonth && moveInDate > periodStart) {
                        activeDays = Math.ceil(
                            (periodEnd.getTime() - moveInDate.getTime()) / (1000 * 60 * 60 * 24)
                        ) + 1;
                        fraction = activeDays / totalDaysInMonth;
                    }

                    const amountDue = Math.round(fullMonthTotal * fraction * 100) / 100;

                    // Generate invoice number
                    const invoiceNumber = `INV-${currentYear}${String(currentMonth + 1).padStart(2, '0')}-${house.id.substring(0, 8).toUpperCase()}`;

                    // Build rate snapshot for audit trail
                    const rateSnapshot = buildRateSnapshot(billingProfile, fullMonthTotal);

                    // Determine invoice type
                    const invoiceType = getInvoiceType(billingProfile);

                    // Create Invoice
                    const { data: newInvoice, error: invoiceError } = await supabase
                        .from('invoices')
                        .insert({
                            resident_id: residentLink.resident_id,
                            house_id: house.id,
                            billing_profile_id: billingProfile.id,
                            invoice_number: invoiceNumber,
                            amount_due: amountDue,
                            amount_paid: 0,
                            status: 'unpaid',
                            invoice_type: invoiceType,
                            rate_snapshot: rateSnapshot,
                            due_date: dueDate.toISOString().split('T')[0],
                            period_start: periodStartStr,
                            period_end: periodEndStr,
                            created_by: user.id,
                        })
                        .select()
                        .single();

                    if (invoiceError) {
                        result.errors.push(`Invoice for ${houseLabel} (${periodStartStr}): ${invoiceError.message}`);
                        currentMonth++;
                        if (currentMonth > 11) {
                            currentMonth = 0;
                            currentYear++;
                        }
                        continue;
                    }

                    // Create Invoice Items
                    const invoiceItems = monthlyItems.map((item) => ({
                        invoice_id: newInvoice.id,
                        description: isFirstMonth && fraction < 1
                            ? `${item.name} (Pro-rata: ${activeDays}/${totalDaysInMonth} days)`
                            : item.name,
                        amount: Math.round(item.amount * fraction * 100) / 100,
                    }));

                    if (invoiceItems.length > 0) {
                        const { error: itemsError } = await supabase
                            .from('invoice_items')
                            .insert(invoiceItems);

                        if (itemsError) {
                            result.errors.push(`Items for ${houseLabel} (${periodStartStr}): ${itemsError.message}`);
                        }
                    }

                    result.generated++;

                    // Try to auto-debit from wallet
                    const debitResult = await debitWalletForInvoice(residentLink.resident_id, newInvoice.id);
                    if (debitResult.success && debitResult.amountDebited > 0) {
                        console.log(`[Billing] Auto-debited ₦${debitResult.amountDebited} from wallet for ${invoiceNumber}`);
                    }

                    // Move to next month
                    currentMonth++;
                    if (currentMonth > 11) {
                        currentMonth = 0;
                        currentYear++;
                    }
                }

            } catch (houseError: any) {
                result.errors.push(`House ${houseLabel}: ${houseError.message}`);
            }
        }
    } catch (error: any) {
        result.success = false;
        result.errors.push(`Unexpected error: ${error.message}`);
    }

    console.log(`[Billing] Complete: Generated=${result.generated}, Skipped=${result.skipped}`);

    revalidatePath('/billing');
    return result;
}
