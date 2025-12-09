import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seedAdditionalData() {
  console.log('🌱 Seeding additional data to staging database...\n');

  try {
    // Step 1: Fetch existing data
    console.log('📊 Fetching existing data from database...');

    const { data: houseTypes, error: htError } = await supabase
      .from('house_types')
      .select('id, name')
      .order('name');

    if (htError) throw new Error(`Error fetching house types: ${htError.message}`);
    console.log(`  ✅ Found ${houseTypes.length} house types`);

    const { data: houses, error: housesError } = await supabase
      .from('houses')
      .select('id, house_number, street_id, house_type_id, street:streets(name), house_type:house_types(name)')
      .order('house_number');

    if (housesError) throw new Error(`Error fetching houses: ${housesError.message}`);
    console.log(`  ✅ Found ${houses.length} houses`);

    const { data: adminUser, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .single();

    if (adminError) throw new Error(`Error fetching admin user: ${adminError.message}`);
    console.log(`  ✅ Found admin user: ${adminUser.id}\n`);

    // Step 2: Create Billing Profiles with Items
    console.log('💰 Creating billing profiles...');

    const billingProfiles = [
      {
        name: 'Detached Premium',
        description: 'Premium billing for detached 4-bedroom houses',
        house_type: 'Detached',
        items: [
          { name: 'Security Levy', amount: 15000, frequency: 'monthly', is_mandatory: true },
          { name: 'Estate Maintenance', amount: 10000, frequency: 'monthly', is_mandatory: true },
          { name: 'Waste Management', amount: 3000, frequency: 'monthly', is_mandatory: true },
          { name: 'Annual Subscription', amount: 50000, frequency: 'yearly', is_mandatory: true },
        ],
      },
      {
        name: 'Semi-Detached Standard',
        description: 'Standard billing for semi-detached 3-bedroom houses',
        house_type: 'Semi-Detached',
        items: [
          { name: 'Security Levy', amount: 12000, frequency: 'monthly', is_mandatory: true },
          { name: 'Estate Maintenance', amount: 8000, frequency: 'monthly', is_mandatory: true },
          { name: 'Waste Management', amount: 2500, frequency: 'monthly', is_mandatory: true },
          { name: 'Annual Subscription', amount: 40000, frequency: 'yearly', is_mandatory: true },
        ],
      },
      {
        name: 'Terrace Basic',
        description: 'Basic billing for terrace 3-bedroom houses',
        house_type: 'Terrace',
        items: [
          { name: 'Security Levy', amount: 10000, frequency: 'monthly', is_mandatory: true },
          { name: 'Estate Maintenance', amount: 6000, frequency: 'monthly', is_mandatory: true },
          { name: 'Waste Management', amount: 2000, frequency: 'monthly', is_mandatory: true },
          { name: 'Annual Subscription', amount: 30000, frequency: 'yearly', is_mandatory: true },
        ],
      },
      {
        name: 'Flat Compact',
        description: 'Compact billing for 2-bedroom flats',
        house_type: 'Flat',
        items: [
          { name: 'Security Levy', amount: 8000, frequency: 'monthly', is_mandatory: true },
          { name: 'Estate Maintenance', amount: 5000, frequency: 'monthly', is_mandatory: true },
          { name: 'Waste Management', amount: 1500, frequency: 'monthly', is_mandatory: true },
          { name: 'Annual Subscription', amount: 25000, frequency: 'yearly', is_mandatory: true },
        ],
      },
      {
        name: 'Maisonette Plus',
        description: 'Enhanced billing for 2-bedroom maisonettes',
        house_type: 'Maisonette',
        items: [
          { name: 'Security Levy', amount: 9000, frequency: 'monthly', is_mandatory: true },
          { name: 'Estate Maintenance', amount: 6000, frequency: 'monthly', is_mandatory: true },
          { name: 'Waste Management', amount: 2000, frequency: 'monthly', is_mandatory: true },
          { name: 'Annual Subscription', amount: 28000, frequency: 'yearly', is_mandatory: true },
        ],
      },
    ];

    const createdProfiles = [];
    let totalItems = 0;

    for (const profile of billingProfiles) {
      console.log(`\n  Creating profile: ${profile.name}`);

      // Create billing profile
      const { data: newProfile, error: profileError } = await supabase
        .from('billing_profiles')
        .insert({
          name: profile.name,
          description: profile.description,
          is_active: true,
          created_by: adminUser.id,
        })
        .select()
        .single();

      if (profileError) {
        console.error(`    ❌ Error creating profile: ${profileError.message}`);
        continue;
      }

      console.log(`    ✅ Created profile: ${newProfile.id}`);
      createdProfiles.push({ ...newProfile, house_type: profile.house_type });

      // Create billing items
      const items = profile.items.map(item => ({
        ...item,
        billing_profile_id: newProfile.id,
      }));

      const { error: itemsError } = await supabase
        .from('billing_items')
        .insert(items);

      if (itemsError) {
        console.error(`    ❌ Error creating items: ${itemsError.message}`);
      } else {
        console.log(`    ✅ Created ${items.length} billing items`);
        totalItems += items.length;
      }
    }

    console.log(`\n  📝 Summary: Created ${createdProfiles.length} profiles with ${totalItems} billing items\n`);

    // Step 3: Link Billing Profiles to House Types
    console.log('🔗 Linking billing profiles to house types...');

    for (const profile of createdProfiles) {
      const houseType = houseTypes.find(ht => ht.name === profile.house_type);
      if (!houseType) {
        console.error(`  ❌ House type not found: ${profile.house_type}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('house_types')
        .update({ billing_profile_id: profile.id })
        .eq('id', houseType.id);

      if (updateError) {
        console.error(`  ❌ Error linking ${profile.house_type}: ${updateError.message}`);
      } else {
        console.log(`  ✅ Linked "${profile.name}" to ${profile.house_type}`);
      }
    }

    // Step 4: Create Residents
    console.log('\n👥 Creating residents...');

    const residents = [
      {
        first_name: 'Ada',
        last_name: 'Okonkwo',
        email: 'ada.okonkwo@example.com',
        phone_primary: '+234 801 234 5678',
        account_status: 'active',
        verification_status: 'verified',
        houses: [
          { house_number: '1', street_name: 'Crescent Close', move_in_date: '2025-03-15', is_primary: true },
        ],
      },
      {
        first_name: 'Chidi',
        last_name: 'Nwankwo',
        email: 'chidi.nwankwo@example.com',
        phone_primary: '+234 802 345 6789',
        account_status: 'active',
        verification_status: 'verified',
        houses: [
          { house_number: '10', street_name: 'Palm Avenue', move_in_date: '2024-06-01', is_primary: true },
          { house_number: 'A1', street_name: 'Garden View', move_in_date: '2024-01-10', is_primary: false },
        ],
      },
      {
        first_name: 'Blessing',
        last_name: 'Adeleke',
        email: 'blessing.adeleke@example.com',
        phone_primary: '+234 803 456 7890',
        account_status: 'active',
        verification_status: 'verified',
        houses: [
          { house_number: '14', street_name: 'Palm Avenue', move_in_date: '2024-09-01', is_primary: true },
        ],
      },
      {
        first_name: 'Emeka',
        last_name: 'Obi',
        email: 'emeka.obi@example.com',
        phone_primary: '+234 804 567 8901',
        account_status: 'active',
        verification_status: 'pending',
        houses: [
          { house_number: '101', street_name: 'Sunrise Lane', move_in_date: '2025-05-20', is_primary: true },
        ],
      },
      {
        first_name: 'Ngozi',
        last_name: 'Eze',
        email: 'ngozi.eze@example.com',
        phone_primary: '+234 805 678 9012',
        account_status: 'active',
        verification_status: 'verified',
        houses: [
          { house_number: 'B1', street_name: 'Garden View', move_in_date: '2024-02-01', is_primary: true },
        ],
      },
    ];

    let totalResidents = 0;
    let totalHouseLinks = 0;

    for (const resident of residents) {
      console.log(`\n  Creating resident: ${resident.first_name} ${resident.last_name}`);

      // Create resident
      const { data: newResident, error: residentError } = await supabase
        .from('residents')
        .insert({
          first_name: resident.first_name,
          last_name: resident.last_name,
          email: resident.email,
          phone_primary: resident.phone_primary,
          account_status: resident.account_status,
          verification_status: resident.verification_status,
          created_by: adminUser.id,
        })
        .select()
        .single();

      if (residentError) {
        console.error(`    ❌ Error creating resident: ${residentError.message}`);
        continue;
      }

      console.log(`    ✅ Created resident: ${newResident.id} (Code: ${newResident.resident_code})`);
      totalResidents++;

      // Link resident to houses
      for (const houseLink of resident.houses) {
        const house = houses.find(h =>
          h.house_number === houseLink.house_number &&
          h.street.name === houseLink.street_name
        );

        if (!house) {
          console.error(`    ❌ House not found: ${houseLink.house_number} ${houseLink.street_name}`);
          continue;
        }

        const { error: linkError } = await supabase
          .from('resident_houses')
          .insert({
            resident_id: newResident.id,
            house_id: house.id,
            move_in_date: houseLink.move_in_date,
            is_primary: houseLink.is_primary,
            created_by: adminUser.id,
          });

        if (linkError) {
          console.error(`    ❌ Error linking house: ${linkError.message}`);
        } else {
          console.log(`    ✅ Linked to ${house.house_number} ${house.street.name} (Primary: ${houseLink.is_primary}, Move-in: ${houseLink.move_in_date})`);
          totalHouseLinks++;
        }
      }
    }

    console.log(`\n  📝 Summary: Created ${totalResidents} residents with ${totalHouseLinks} house assignments\n`);

    // Final Summary
    console.log('✅ Seed data creation complete!\n');
    console.log('📊 Summary:');
    console.log(`  • Billing Profiles: ${createdProfiles.length}`);
    console.log(`  • Billing Items: ${totalItems}`);
    console.log(`  • Residents: ${totalResidents}`);
    console.log(`  • House Assignments: ${totalHouseLinks}`);
    console.log(`  • Multi-house Resident: Chidi Nwankwo (2 houses)\n`);

  } catch (error) {
    console.error('\n❌ Error during seeding:', error.message);
    process.exit(1);
  }
}

seedAdditionalData();
