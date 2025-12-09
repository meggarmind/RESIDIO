import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

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
