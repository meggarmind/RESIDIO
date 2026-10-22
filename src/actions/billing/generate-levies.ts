'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { debitWalletForInvoiceAtomic } from '@/lib/billing/wallet-invoice-debit';
import { createLogger } from '@/lib/logger';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { planRetroactiveLevies, type LevyPlanProfile, type RetroactiveLevyPlan } from '@/lib/billing/retroactive-levy-plan';
import { resolvePayer, type BillingPayer } from '@/lib/billing/payer';
import type { RateSnapshot } from '@/types/database';
import type { BillingProfileWithItems, LevyGenerationResult } from '@/types/billing';

const log = createLogger('[Levies]');

const LEVY_HOUSE_CHUNK_SIZE = 10;


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

type LevyRunContext = {
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
    userId: string;
    dueWindowDays: number;
};

const emptyResult = (): LevyGenerationResult => ({ success: true, generated: 0, skipped: 0, errors: [], warnings: [] });

/**
 * Reads what every house in a run shares: the user and the two levy settings.
 * Returns null context with a result to hand back when the run should not proceed.
 */
async function prepareLevyRun(): Promise<{ ctx: LevyRunContext | null; result: LevyGenerationResult }> {
    const supabase = await createServerSupabaseClient();
    const result = emptyResult();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { ctx: null, result: { ...result, success: false, errors: ['User not authenticated'] } };
    }

    // Check if auto levy generation is enabled
    const autoGenerateLevies = await getSystemSetting(supabase, 'auto_generate_levies');
    if (autoGenerateLevies === false) {
        log.info('Auto levy generation is disabled');
        return { ctx: null, result };
    }

    // Get due window setting for calculating due dates
    const dueWindowSetting = await getSystemSetting(supabase, 'invoice_due_window_days');
    const dueWindowDays = parseInt(String(dueWindowSetting).replace(/"/g, '')) || 30;

    return { ctx: { supabase, userId: user.id, dueWindowDays }, result };
}

/**
 * Generates one-time levies for a specific house.
 * Called when a house is created or when retroactively applying levies.
 *
 * Logic:
 * 1. Find all active one-time billing profiles
 * 2. For each profile, pick its payer (`resolvePayer`): levies go to a landlord, never a tenant
 * 3. If not already applied (check house_levy_history), generate invoice
 * 4. Record in house_levy_history
 */
export async function generateLeviesForHouse(
    houseId: string
): Promise<LevyGenerationResult> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    if (!auth.authorized) {
        return { ...emptyResult(), success: false, errors: [auth.error || 'Unauthorized'] };
    }

    let result: LevyGenerationResult;
    try {
        const run = await prepareLevyRun();
        if (!run.ctx) return run.result;

        // Get house details
        const { data: house, error: houseError } = await run.ctx.supabase
            .from('houses')
            .select('id, house_number, property_status, is_new_never_occupied')
            .eq('id', houseId)
            .single();

        if (houseError || !house) {
            return { ...emptyResult(), success: false, errors: ['House not found'] };
        }

        result = await generateLeviesForHouseInRun(run.ctx, house);
    } catch (error) {
        result = { ...emptyResult(), success: false, errors: [`Unexpected error: ${error instanceof Error ? error.message : String(error)}`] };
    }

    revalidatePath('/billing');
    return result;
}

/**
 * Per-house levy work, without the permission check, user lookup or settings reads:
 * callers have done those once for the whole run (#778).
 */
async function generateLeviesForHouseInRun(
    { supabase, userId, dueWindowDays }: LevyRunContext,
    house: { id: string; house_number: string; property_status: string | null; is_new_never_occupied: boolean | null }
): Promise<LevyGenerationResult> {
    const houseId = house.id;
    const houseLabel = house.house_number;
    const result = emptyResult();

    try {
        const { data: residentLinks, error: linksError } = await supabase
            .from('resident_houses')
            .select('resident_id, resident_role')
            .eq('house_id', houseId)
            .eq('is_active', true);

        if (linksError) {
            result.errors.push(`Failed to fetch residents for house ${houseLabel}: ${linksError.message}`);
            result.success = false;
            return result;
        }
        const residents = (residentLinks || []).map((link) => ({ id: link.resident_id, role: link.resident_role }));

        // Get all active one-time billing profiles
        const { data: oneTimeProfiles, error: profilesError } = await supabase
            .from('billing_profiles')
            .select(`
                id, name, payer, applicable_roles, is_one_time, is_development_levy,
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
            log.info('No one-time billing profiles found');
            return result;
        }

        log.info(`Found ${oneTimeProfiles.length} one-time profiles for house ${houseLabel}`);

        // Check which profiles apply to this resident's role
        for (const profile of oneTimeProfiles as BillingProfileWithItems[]) {
            try {
                // Check if this is a Development Levy (use flag, fallback to name for backward compatibility)
                const isDevelopmentLevy = profile.is_development_levy === true ||
                    profile.name.toLowerCase().includes('development');

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

                // The profile's payer decides who is billed; a tenant never receives a landlord levy.
                const { payer, reason } = resolvePayer({
                    payer: profile.payer as BillingPayer,
                    house: { vacant: house.property_status === 'vacant', newNeverOccupied: house.is_new_never_occupied === true },
                    applicableRoles: profile.applicable_roles,
                    residents,
                });
                if (!payer) {
                    if (reason === 'No landlord on record') {
                        result.warnings.push(`House ${houseLabel}: no landlord on record, so "${profile.name}" was not raised`);
                    }
                    result.skipped++;
                    continue;
                }
                const targetResidentId = payer.id;

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
                const levyNumberBase = `LEV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${houseId.substring(0, 8).toUpperCase()}`;
                // A later levy for the same house on the same day gets a -2, -3 ... suffix.
                const { data: sameDayLevies } = await supabase
                    .from('invoices')
                    .select('invoice_number')
                    .or(`invoice_number.eq.${levyNumberBase},invoice_number.like.${levyNumberBase}-%`);
                const highestSuffix = (sameDayLevies ?? []).reduce((max, { invoice_number }) =>
                    Math.max(max, invoice_number === levyNumberBase ? 1 : Number(invoice_number.slice(levyNumberBase.length + 1)) || 0), 0);
                const invoiceNumber = highestSuffix ? `${levyNumberBase}-${highestSuffix + 1}` : levyNumberBase;

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
                        created_by: userId,
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
                        applied_by: userId,
                        notes: `Auto-generated levy: ${profile.name}`,
                    });

                if (historyError) {
                    log.error(`Failed to record levy history: ${historyError.message}`);
                }

                result.generated++;
                log.info(`Generated levy "${profile.name}" for house ${houseLabel}`);

                // Audit log for levy generation
                await logAudit({
                    action: 'GENERATE',
                    entityType: 'invoices',
                    entityId: newInvoice.id,
                    entityDisplay: `Levy "${profile.name}" for ${houseLabel}`,
                    newValues: {
                        invoice_number: invoiceNumber,
                        amount: totalAmount,
                        billing_profile: profile.name,
                        is_development_levy: isDevelopmentLevy,
                        house_id: houseId,
                        resident_id: targetResidentId,
                    },
                    description: `Generated one-time levy: ${profile.name}`,
                });

                // Try to auto-debit from wallet
                const debitResult = await debitWalletForInvoiceAtomic(supabase, targetResidentId, newInvoice.id);
                if (debitResult.success && debitResult.amountDebited > 0) {
                    log.info(`Auto-debited ₦${debitResult.amountDebited} from wallet for ${invoiceNumber}`);
                }

            } catch (profileError) {
                result.errors.push(`Profile ${profile.name}: ${profileError instanceof Error ? profileError.message : String(profileError)}`);
            }
        }

    } catch (error) {
        result.success = false;
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
}

/**
 * Generates retroactive levies for all existing houses that haven't had them applied.
 * This is an admin action to backfill levies for houses created before certain profiles existed.
 */
export async function generateRetroactiveLevies(): Promise<LevyGenerationResult> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    if (!auth.authorized) {
        return { ...emptyResult(), success: false, errors: [auth.error || 'Unauthorized'] };
    }

    const result = emptyResult();

    try {
        const run = await prepareLevyRun();
        if (!run.ctx) {
            revalidatePath('/billing');
            return run.result;
        }
        const { ctx } = run;
        const { supabase } = ctx;

        // Get all active houses
        const { data: houses, error: housesError } = await supabase
            .from('houses')
            .select('id, house_number, property_status, is_new_never_occupied')
            .eq('is_active', true);

        if (housesError) {
            result.errors.push(`Failed to fetch houses: ${housesError.message}`);
            result.success = false;
            return result;
        }

        log.info(`Processing retroactive levies for ${houses?.length || 0} houses`);
        const batchStartedAt = new Date().toISOString();

        // Houses run in small concurrent chunks. Safe because a levy invoice number is
        // derived from the house id and date (no shared sequence), and the wallet debit
        // RPC locks the wallet row, so houses never contend on a counter (#778).
        const allHouses = houses || [];
        for (let i = 0; i < allHouses.length; i += LEVY_HOUSE_CHUNK_SIZE) {
            const chunk = allHouses.slice(i, i + LEVY_HOUSE_CHUNK_SIZE);
            const houseResults = await Promise.all(chunk.map((house) => generateLeviesForHouseInRun(ctx, house)));
            for (const houseResult of houseResults) {
                result.generated += houseResult.generated;
                result.skipped += houseResult.skipped;
                result.errors.push(...houseResult.errors);
                result.warnings.push(...houseResult.warnings);
            }
        }

        log.info(`Retroactive: Generated=${result.generated}, Skipped=${result.skipped}`);

        // Audit log for bulk operation
        if (result.generated > 0) {
            // audit_logs.entity_id is a uuid: the first invoice this run created stands for
            // the batch (#594). Best effort; no invoice found means no audit row.
            let batchQuery = supabase
                .from('invoices')
                .select('id')
                .eq('invoice_type', 'LEVY')
                .gte('created_at', batchStartedAt)
                .order('created_at', { ascending: true })
                .limit(50);
            if (auth.userId) batchQuery = batchQuery.eq('created_by', auth.userId);
            const { data: batchInvoices } = await batchQuery;
            const batchInvoiceIds = (batchInvoices || []).map((i: { id: string }) => i.id);

            if (batchInvoiceIds.length > 0) {
                await logAudit({
                    action: 'GENERATE',
                    entityType: 'invoices',
                    entityId: batchInvoiceIds[0],
                    entityDisplay: `Retroactive Levies - ${result.generated} generated`,
                    newValues: {
                        batch: 'retroactive-levy-batch',
                        total_count: result.generated,
                        invoice_ids: batchInvoiceIds,
                        houses_processed: houses?.length || 0,
                        generated_count: result.generated,
                        skipped_count: result.skipped,
                        error_count: result.errors.length,
                    },
                    description: `Retroactive levy generation: ${result.generated} levies across ${houses?.length || 0} houses`,
                });
            }
        }

    } catch (error) {
        result.success = false;
        result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    }

    revalidatePath('/billing');
    return result;
}

/**
 * Dry run of `generateRetroactiveLevies` for its confirmation dialog (#790): how many
 * houses and invoices it would create and their naira total. Reads only.
 */
export async function previewRetroactiveLevies(): Promise<{ data: RetroactiveLevyPlan | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

    const autoGenerateLevies = await getSystemSetting(supabase, 'auto_generate_levies');

    const [houses, links, history, profiles] = await Promise.all([
        fetchAllRows<{ id: string; house_number: string; property_status: string | null; is_new_never_occupied: boolean | null }>((from, to) =>
            supabase.from('houses').select('id, house_number, property_status, is_new_never_occupied').eq('is_active', true).order('id').range(from, to)),
        fetchAllRows<{ house_id: string; resident_id: string; resident_role: string }>((from, to) =>
            supabase.from('resident_houses').select('house_id, resident_id, resident_role')
                .eq('is_active', true).order('id').range(from, to)),
        fetchAllRows<{ house_id: string; billing_profile_id: string }>((from, to) =>
            supabase.from('house_levy_history').select('house_id, billing_profile_id').order('id').range(from, to)),
        supabase.from('billing_profiles')
            .select('id, name, payer, applicable_roles, is_development_levy, billing_items(amount)')
            .eq('is_active', true).eq('is_one_time', true),
    ]);

    const error = houses.error || links.error || history.error || profiles.error?.message;
    if (error) return { data: null, error };

    return {
        data: planRetroactiveLevies({
            autoGenerateEnabled: autoGenerateLevies !== false,
            houses: (houses.data || []).map((h) => ({ id: h.id, label: h.house_number, vacant: h.property_status === 'vacant', newNeverOccupied: h.is_new_never_occupied === true })),
            residentLinks: links.data || [],
            profiles: (profiles.data || []) as LevyPlanProfile[],
            history: history.data || [],
        }),
        error: null,
    };
}
