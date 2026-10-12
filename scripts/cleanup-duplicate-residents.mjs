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

async function cleanupDuplicates() {
  console.log('🧹 Cleaning up duplicate residents...\n');

  try {
    // Fetch all residents
    const { data: residents, error: resError } = await supabase
      .from('residents')
      .select('id, first_name, last_name, email, resident_code, created_at')
      .order('email')
      .order('created_at');

    if (resError) throw new Error(`Error fetching residents: ${resError.message}`);

    console.log(`📊 Found ${residents.length} total residents\n`);

    // Group by email to find duplicates
    const grouped = residents.reduce((acc, resident) => {
      if (!acc[resident.email]) {
        acc[resident.email] = [];
      }
      acc[resident.email].push(resident);
      return acc;
    }, {});

    // Find duplicates (more than 1 resident with same email)
    const duplicates = Object.entries(grouped).filter(([_, residents]) => residents.length > 1);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!\n');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} residents with duplicates:\n`);

    let deletedCount = 0;

    for (const [email, residentList] of duplicates) {
      // Sort by created_at to keep the latest one
      const sorted = residentList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const keepResident = sorted[0]; // Most recent
      const toDelete = sorted.slice(1); // Older duplicates

      console.log(`  ${email}:`);
      console.log(`    ✅ Keeping: ${keepResident.first_name} ${keepResident.last_name} (Code: ${keepResident.resident_code}, Created: ${new Date(keepResident.created_at).toLocaleString()})`);

      for (const resident of toDelete) {
        console.log(`    🗑️  Deleting: ${resident.first_name} ${resident.last_name} (Code: ${resident.resident_code}, Created: ${new Date(resident.created_at).toLocaleString()})`);

        // Delete the resident (cascade will handle resident_houses)
        const { error: deleteError } = await supabase
          .from('residents')
          .delete()
          .eq('id', resident.id);

        if (deleteError) {
          console.error(`       ❌ Error deleting: ${deleteError.message}`);
        } else {
          console.log(`       ✅ Deleted successfully`);
          deletedCount++;
        }
      }
      console.log('');
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} duplicate residents.\n`);

    // Verify final count
    const { data: finalResidents, error: finalError } = await supabase
      .from('residents')
      .select('id, first_name, last_name, email, resident_code');

    if (!finalError) {
      console.log(`📊 Final resident count: ${finalResidents.length}`);
      console.log('\nRemaining residents:');
      finalResidents.forEach(r => {
        console.log(`  • ${r.first_name} ${r.last_name} (Code: ${r.resident_code}) - ${r.email}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

cleanupDuplicates();
