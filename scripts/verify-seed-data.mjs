import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function verifySeedData() {
  console.log('🔍 Verifying seed data in staging database...\n');

  // 1. Verify Billing Profiles
  console.log('💰 Billing Profiles:');
  const { data: profiles, error: profilesError } = await supabase
    .from('billing_profiles')
    .select('id, name, is_active')
    .order('name');

  if (profilesError) {
    console.error('  ❌ Error fetching billing profiles:', profilesError.message);
  } else {
    console.log(`  ✅ Found ${profiles.length} billing profiles:`);
    profiles.forEach(p => console.log(`     • ${p.name} (${p.is_active ? 'Active' : 'Inactive'})`));
  }

  //2. Verify Billing Items
  console.log('\n💵 Billing Items:');
  const { data: items, error: itemsError } = await supabase
    .from('billing_items')
    .select('name, amount, frequency, billing_profile:billing_profiles(name)')
    .order('name');

  if (itemsError) {
    console.error('  ❌ Error fetching billing items:', itemsError.message);
  } else {
    console.log(`  ✅ Found ${items.length} billing items total`);
    const grouped = items.reduce((acc, item) => {
      const profile = item.billing_profile.name;
      if (!acc[profile]) acc[profile] = [];
      acc[profile].push(item);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([profile, items]) => {
      console.log(`\n  ${profile}:`);
      items.forEach(i => console.log(`     • ${i.name}: ₦${i.amount.toLocaleString()} (${i.frequency})`));
    });
  }

  // 3. Verify House Types with Billing Profiles
  console.log('\n\n🏠 House Types with Billing Profiles:');
  const { data: houseTypes, error: htError } = await supabase
    .from('house_types')
    .select('name, billing_profile:billing_profiles(name)')
    .order('name');

  if (htError) {
    console.error('  ❌ Error fetching house types:', htError.message);
  } else {
    console.log(`  ✅ Found ${houseTypes.length} house types:`);
    houseTypes.forEach(ht => {
      const profile = ht.billing_profile ? ht.billing_profile.name : 'No Profile';
      console.log(`     • ${ht.name} → ${profile}`);
    });
  }

  // 4. Verify Residents
  console.log('\n\n👥 Residents:');
  const { data: residents, error: resError } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_code, email, verification_status, account_status')
    .order('last_name');

  if (resError) {
    console.error('  ❌ Error fetching residents:', resError.message);
  } else {
    console.log(`  ✅ Found ${residents.length} residents:`);
    residents.forEach(r => {
      console.log(`     • ${r.first_name} ${r.last_name} (Code: ${r.resident_code})`);
      console.log(`       Email: ${r.email}, Status: ${r.account_status}, Verified: ${r.verification_status}`);
    });
  }

  // 5. Verify Resident-House Assignments
  console.log('\n\n🏘️  Resident-House Assignments:');
  const { data: assignments, error: assignError } = await supabase
    .from('resident_houses')
    .select(`
      resident:residents(first_name, last_name, resident_code),
      house:houses(house_number, street:streets(name)),
      is_primary,
      move_in_date
    `)
    .order('move_in_date');

  if (assignError) {
    console.error('  ❌ Error fetching assignments:', assignError.message);
  } else {
    console.log(`  ✅ Found ${assignments.length} resident-house assignments:`);
    assignments.forEach(a => {
      const primary = a.is_primary ? '⭐ Primary' : '  Secondary';
      console.log(`     ${primary} | ${a.resident.first_name} ${a.resident.last_name} → ${a.house.house_number} ${a.house.street.name} (Move-in: ${a.move_in_date})`);
    });
  }

  // Summary
  console.log('\n\n📊 Summary:');
  console.log(`  • Billing Profiles: ${profiles?.length || 0}`);
  console.log(`  • Billing Items: ${items?.length || 0}`);
  console.log(`  • House Types Configured: ${houseTypes?.filter(ht => ht.billing_profile).length || 0}/${houseTypes?.length || 0}`);
  console.log(`  • Residents: ${residents?.length || 0}`);
  console.log(`  • House Assignments: ${assignments?.length || 0}`);

  // Find multi-house resident
  const residentCounts = assignments?.reduce((acc, a) => {
    const name = `${a.resident.first_name} ${a.resident.last_name}`;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const multiHouse = Object.entries(residentCounts || {}).filter(([_, count]) => count > 1);
  if (multiHouse.length > 0) {
    console.log(`  • Multi-house Residents: ${multiHouse.map(([name, count]) => `${name} (${count} houses)`).join(', ')}`);
  }

  console.log('\n✅ Verification complete!\n');
}

verifySeedData().catch(console.error);
