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

async function verifyUsers() {
  console.log('🔍 Verifying test users in staging database...\n');

  // Check profiles table
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, role_id')
    .order('email');

  if (profilesError) {
    console.error('❌ Error fetching profiles:', profilesError.message);
    return;
  }

  console.log(`✅ Found ${profiles.length} profiles:\n`);
  profiles.forEach(p => {
    console.log(`  • ${p.email} (role_id: ${p.role_id ?? 'none'}) - ID: ${p.id}`);
  });

  console.log('\n✅ Verification complete!');
}

verifyUsers().catch(console.error);
