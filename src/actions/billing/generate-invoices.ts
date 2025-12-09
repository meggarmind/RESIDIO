'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { debitWalletForInvoice } from '@/actions/billing/wallet';

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
 * Generates invoices for all occupied houses with billing profiles.
 * For each house, generates invoices from the resident's move-in date to the current month.
 * Pro-rata applies only to the first (move-in) month; all subsequent months are full rate.
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
        // 1. Find all occupied houses with billing profiles
        const { data: houses, error: housesError } = await supabase
            .from('houses')
            .select(`
                id,
                house_number,
                house_type_id,
                house_type:house_types(
                    id,
                    name,
                    billing_profile_id,
                    billing_profile:billing_profiles(
                        id,
                        name,
                        billing_items(id, name, amount, frequency, is_mandatory)
                    )
                ),
                street:streets(name)
            `)
            .eq('is_occupied', true)
            .eq('is_active', true);

        if (housesError) {
            result.errors.push(`Failed to fetch houses: ${housesError.message}`);
            result.success = false;
            return result;
        }

        console.log(`[Billing] Found ${houses?.length || 0} occupied houses`);

        for (const house of houses || []) {
            const houseLabel = `${house.house_number}`;

            try {
                // Validate house type and billing profile
                if (!house.house_type_id) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'No house type assigned' });
                    continue;
                }

                const houseType = Array.isArray(house.house_type)
                    ? house.house_type[0]
                    : house.house_type;

                if (!houseType) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'House type not found' });
                    continue;
                }

                if (!houseType.billing_profile_id) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: `House type "${houseType.name}" has no billing profile` });
                    continue;
                }

                const billingProfile = Array.isArray(houseType.billing_profile)
                    ? houseType.billing_profile[0]
                    : houseType.billing_profile;

                if (!billingProfile) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'Billing profile data not loaded' });
                    continue;
                }

                // 2. Find the primary active resident for this house
                const { data: residentLink, error: residentError } = await supabase
                    .from('resident_houses')
                    .select(`
                        id,
                        resident_id,
                        move_in_date,
                        resident:residents(id, first_name, last_name, resident_code)
                    `)
                    .eq('house_id', house.id)
                    .eq('is_primary', true)
                    .eq('is_active', true)
                    .single();

                if (residentError || !residentLink) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'No primary active resident found' });
                    continue;
                }

                // Get monthly billing items
                const monthlyItems = billingProfile.billing_items?.filter(
                    (item: any) => item.frequency === 'monthly'
                ) || [];

                if (monthlyItems.length === 0) {
                    result.skipped++;
                    result.skipReasons.push({ house: houseLabel, reason: 'Billing profile has no monthly items' });
                    continue;
                }

                const fullMonthTotal = monthlyItems.reduce(
                    (sum: number, item: any) => sum + (item.amount || 0),
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
                    const dueDate = new Date(currentYear, currentMonth, 7);

                    const periodStartStr = periodStart.toISOString().split('T')[0];
                    const periodEndStr = periodEnd.toISOString().split('T')[0];

                    // Check for existing invoice (idempotency)
                    const { data: existingInvoice } = await supabase
                        .from('invoices')
                        .select('id')
                        .eq('resident_id', residentLink.resident_id)
                        .eq('house_id', house.id)
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
                    const invoiceItems = monthlyItems.map((item: any) => ({
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
