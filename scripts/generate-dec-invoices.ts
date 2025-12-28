/**
 * Script to generate December 2025 invoices
 * Run with: npx tsx scripts/generate-dec-invoices.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log('Checking current invoice status...');

    // Check current status
    const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, period_start')
        .gte('period_start', '2025-12-01')
        .lt('period_start', '2026-01-01');

    console.log(`Current December 2025 invoices: ${invoices?.length || 0}`);

    if (invoices && invoices.length > 0) {
        console.log('December 2025 invoices already exist. Exiting.');
        return;
    }

    console.log('\nTo generate invoices, please use the Billing page in the UI');
    console.log('or call the generateMonthlyInvoices action directly.\n');

    // Show what houses exist
    const { data: houses } = await supabase
        .from('houses')
        .select(`
            id,
            house_number,
            is_active,
            billing_profile_id,
            streets(name)
        `)
        .eq('is_active', true);

    console.log(`Active houses: ${houses?.length || 0}`);
    houses?.forEach(h => {
        console.log(`  - ${(h.streets as any)?.name || 'Unknown Street'} ${h.house_number} (billing: ${h.billing_profile_id ? 'assigned' : 'not assigned'})`);
    });
}

main().catch(console.error);
