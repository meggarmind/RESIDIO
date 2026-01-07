#!/usr/bin/env npx tsx
/**
 * Manual Invoice Generation Script
 *
 * Usage: npx tsx scripts/generate-invoices-manual.ts
 *
 * This script generates invoices for all eligible houses up to the current month.
 * It uses the admin Supabase client to bypass authentication.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Support both LOCAL and CLOUD suffixes, preferring CLOUD for production
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL_CLOUD or NEXT_PUBLIC_SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_ROLE_KEY_CLOUD or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

console.log(`Using Supabase: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
});

// Types
interface ResidentHouseLink {
    id: string;
    resident_id: string;
    resident_role: string;
    is_active: boolean;
    move_in_date: string;
    resident: {
        id: string;
        first_name: string;
        last_name: string;
        resident_code: string;
    };
}

interface BillingProfile {
    id: string;
    name: string;
    target_type: string;
    billing_items: Array<{
        id: string;
        name: string;
        amount: number;
        is_mandatory: boolean;
    }>;
}

interface House {
    id: string;
    house_number: string;
    short_name: string;
    is_active: boolean;
    billing_profile_id: string | null;
    // house_type comes back as an object from Supabase join
    house_type: {
        billing_profile_id: string | null;
    } | null;
    resident_houses: ResidentHouseLink[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HouseRow = any; // Use any for the raw database row, we'll type-check at runtime

// Find billable resident based on priority
function findBillableResident(residentHouses: ResidentHouseLink[], includeVacant: boolean): ResidentHouseLink | null {
    const activeResidents = residentHouses.filter(rh => rh.is_active);

    // Priority 1: Tenant
    const tenant = activeResidents.find(rh => rh.resident_role === 'tenant');
    if (tenant) return tenant;

    // Priority 2: Resident Landlord
    const residentLandlord = activeResidents.find(rh => rh.resident_role === 'resident_landlord');
    if (residentLandlord) return residentLandlord;

    // Priority 3: Non-Resident Landlord (only if billing vacant houses)
    if (includeVacant) {
        const nonResidentLandlord = activeResidents.find(rh => rh.resident_role === 'non_resident_landlord');
        if (nonResidentLandlord) return nonResidentLandlord;
    }

    return null;
}

// Get system setting
async function getSetting(key: string, defaultValue: any): Promise<any> {
    const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();
    return data?.value ?? defaultValue;
}

// Main generation function
async function generateInvoices() {
    const startTime = Date.now();
    console.log('Starting invoice generation...\n');

    // Get settings
    const billVacantHouses = await getSetting('bill_vacant_houses', false);
    const dueWindowDays = await getSetting('invoice_due_window_days', 30);

    console.log(`Settings: billVacantHouses=${billVacantHouses}, dueWindowDays=${dueWindowDays}`);

    // Get all active houses with their residents
    const { data: houses, error: housesError } = await supabase
        .from('houses')
        .select(`
            id,
            house_number,
            short_name,
            is_active,
            billing_profile_id,
            house_type:house_types(billing_profile_id),
            resident_houses!resident_houses_house_id_fkey(
                id,
                resident_id,
                resident_role,
                is_active,
                move_in_date,
                resident:residents!resident_houses_resident_id_fkey(id, first_name, last_name, resident_code)
            )
        `)
        .eq('is_active', true);

    if (housesError) {
        console.error('Error fetching houses:', housesError);
        return;
    }

    console.log(`Found ${houses?.length || 0} active houses\n`);

    // Target January 2026 specifically
    const targetMonth = new Date('2026-01-15'); // Mid-January 2026
    const periodStart = new Date(Date.UTC(targetMonth.getFullYear(), targetMonth.getMonth(), 1));
    const periodEnd = new Date(Date.UTC(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0));
    const dueDate = new Date(periodStart);
    dueDate.setUTCDate(dueDate.getUTCDate() + dueWindowDays);

    console.log(`Target period: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`);
    console.log(`Due date: ${dueDate.toISOString().slice(0, 10)}\n`);

    let generated = 0;
    let skipped = 0;
    const skipReasons: Array<{ house: string; reason: string }> = [];
    const errors: string[] = [];

    for (const house of (houses || []) as HouseRow[]) {
        const houseName = house.short_name || house.house_number;

        // Get effective billing profile - house_type is an object with billing_profile_id
        const houseType = house.house_type as { billing_profile_id: string | null } | null;
        const profileId = house.billing_profile_id || houseType?.billing_profile_id;

        if (!profileId) {
            skipped++;
            skipReasons.push({ house: houseName, reason: 'No billing profile assigned' });
            continue;
        }

        // Fetch billing profile with items
        const { data: profile, error: profileError } = await supabase
            .from('billing_profiles')
            .select(`
                id,
                name,
                target_type,
                billing_items(id, name, amount, is_mandatory)
            `)
            .eq('id', profileId)
            .single();

        if (profileError) {
            skipped++;
            skipReasons.push({ house: houseName, reason: `Profile fetch error: ${profileError.message}` });
            continue;
        }

        if (!profile) {
            skipped++;
            skipReasons.push({ house: houseName, reason: 'Billing profile not found' });
            continue;
        }

        if (profile.target_type !== 'house') {
            skipped++;
            skipReasons.push({ house: houseName, reason: `Profile target is '${profile.target_type}', not 'house'` });
            continue;
        }

        // Find billable resident
        const residentHouses = house.resident_houses as ResidentHouseLink[];
        const billableResident = findBillableResident(residentHouses, billVacantHouses);

        if (!billableResident) {
            skipped++;
            skipReasons.push({ house: houseName, reason: 'No billable resident found' });
            continue;
        }

        const resident = billableResident.resident;

        // Check if invoice already exists for this period
        const { data: existingInvoice } = await supabase
            .from('invoices')
            .select('id')
            .eq('house_id', house.id)
            .eq('resident_id', resident.id)
            .eq('period_start', periodStart.toISOString().slice(0, 10))
            .single();

        if (existingInvoice) {
            skipped++;
            skipReasons.push({ house: houseName, reason: 'Invoice already exists for this period' });
            continue;
        }

        // Calculate total from billing items (all items are included)
        const billingItems = (profile as BillingProfile).billing_items || [];
        const totalAmount = billingItems.reduce((sum, item) => sum + Number(item.amount), 0);

        if (totalAmount <= 0) {
            skipped++;
            skipReasons.push({ house: houseName, reason: 'No billable items (total is 0)' });
            continue;
        }

        // Generate invoice number
        const monthStr = `${targetMonth.getFullYear()}${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
        const invoiceNumber = `INV-${monthStr}-${house.house_number}`;

        // Create invoice
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                resident_id: resident.id,
                house_id: house.id,
                billing_profile_id: profile.id,
                invoice_number: invoiceNumber,
                amount_due: totalAmount,
                amount_paid: 0,
                status: 'unpaid',
                invoice_type: 'SERVICE_CHARGE',
                due_date: dueDate.toISOString().slice(0, 10),
                period_start: periodStart.toISOString().slice(0, 10),
                period_end: periodEnd.toISOString().slice(0, 10),
                rate_snapshot: {
                    profile_name: profile.name,
                    items: billingItems.map(item => ({
                        name: item.name,
                        amount: Number(item.amount)
                    })),
                    generated_at: new Date().toISOString()
                }
            })
            .select()
            .single();

        if (invoiceError) {
            errors.push(`${houseName}: ${invoiceError.message}`);
            continue;
        }

        // Create invoice items
        for (const item of billingItems) {
            await supabase
                .from('invoice_items')
                .insert({
                    invoice_id: invoice.id,
                    description: item.name,
                    amount: Number(item.amount)
                });
        }

        generated++;
        console.log(`  ✓ Generated: ${invoiceNumber} for ${resident.first_name} ${resident.last_name} (${houseName}) - ₦${totalAmount.toLocaleString()}`);
    }

    const durationMs = Date.now() - startTime;

    // Log generation run
    await supabase
        .from('invoice_generation_log')
        .insert({
            generated_by: null, // Script run
            trigger_type: 'manual',
            target_period: periodStart.toISOString().slice(0, 10),
            generated_count: generated,
            skipped_count: skipped,
            error_count: errors.length,
            skip_reasons: skipReasons,
            errors: errors,
            duration_ms: durationMs
        });

    console.log('\n' + '='.repeat(60));
    console.log('INVOICE GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Generated: ${generated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Duration: ${durationMs}ms`);

    if (skipReasons.length > 0) {
        console.log('\nSkip Reasons:');
        skipReasons.forEach(sr => console.log(`  - ${sr.house}: ${sr.reason}`));
    }

    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(e => console.log(`  - ${e}`));
    }
}

// Run
generateInvoices()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
