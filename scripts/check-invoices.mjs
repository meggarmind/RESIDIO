import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL_CLOUD or SUPABASE_SERVICE_ROLE_KEY_CLOUD. Set them in .env.local.'
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkInvoices() {
  console.log('🔍 Checking invoices in staging database...\n');

  try {
    // Get all invoices with resident info
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        amount_due,
        amount_paid,
        status,
        due_date,
        period_start,
        period_end,
        resident:residents(first_name, last_name, resident_code),
        house:houses(house_number, street:streets(name))
      `)
      .order('created_at', { ascending: false });

    if (invoicesError) {
      console.error('❌ Error fetching invoices:', invoicesError.message);
      return;
    }

    console.log(`📊 Total Invoices: ${invoices.length}\n`);

    if (invoices.length === 0) {
      console.log('⚠️  No invoices found in database!\n');
      console.log('Run invoice generation to create invoices for residents.\n');
      return;
    }

    // Group by resident
    const byResident = invoices.reduce((acc, inv) => {
      const residentName = `${inv.resident.first_name} ${inv.resident.last_name}`;
      if (!acc[residentName]) {
        acc[residentName] = [];
      }
      acc[residentName].push(inv);
      return acc;
    }, {});

    console.log('📋 Invoices by Resident:\n');
    for (const [residentName, residentInvoices] of Object.entries(byResident)) {
      console.log(`\n${residentName} (${residentInvoices.length} invoices):`);
      residentInvoices.forEach(inv => {
        const house = `${inv.house.house_number} ${inv.house.street.name}`;
        const period = `${inv.period_start} to ${inv.period_end}`;
        console.log(`  • ${inv.invoice_number} - ${house} - ₦${inv.amount_due.toLocaleString()} (${inv.status}) - ${period}`);
      });
    }

    console.log('\n\n📊 Summary:');
    console.log(`  • Total Invoices: ${invoices.length}`);
    console.log(`  • Unique Residents: ${Object.keys(byResident).length}`);
    console.log(`  • Paid: ${invoices.filter(i => i.status === 'paid').length}`);
    console.log(`  • Unpaid: ${invoices.filter(i => i.status === 'unpaid').length}`);
    console.log(`  • Partially Paid: ${invoices.filter(i => i.status === 'partially_paid').length}`);

  } catch (error) {
    console.error('\n❌ Error during check:', error.message);
    process.exit(1);
  }
}

checkInvoices();
