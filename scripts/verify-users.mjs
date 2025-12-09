import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

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
    .select('id, email, role')
    .order('email');

  if (profilesError) {
    console.error('❌ Error fetching profiles:', profilesError.message);
    return;
  }

  console.log(`✅ Found ${profiles.length} profiles:\n`);
  profiles.forEach(p => {
    console.log(`  • ${p.email} (${p.role}) - ID: ${p.id}`);
  });

  console.log('\n✅ Verification complete!');
}

verifyUsers().catch(console.error);
