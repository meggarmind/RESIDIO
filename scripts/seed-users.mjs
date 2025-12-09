import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const testUsers = [
  { email: 'admin@residio.test', password: 'password123', role: 'admin' },
  { email: 'chairman@residio.test', password: 'password123', role: 'chairman' },
  { email: 'finance@residio.test', password: 'password123', role: 'financial_secretary' },
  { email: 'security@residio.test', password: 'password123', role: 'security_officer' },
];

async function seedUsers() {
  console.log('🌱 Seeding test users to staging database...\n');

  for (const user of testUsers) {
    console.log(`Creating user: ${user.email} (${user.role})`);

    try {
      // Create user in auth.users
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          role: user.role,
        },
      });

      if (error) {
        if (error.message.includes('already registered')) {
          console.log(`  ⚠️  User already exists, skipping...`);
        } else {
          console.error(`  ❌ Error creating ${user.email}:`, error.message);
        }
      } else {
        console.log(`  ✅ Created user: ${data.user.id}`);

        // Profile should be auto-created by trigger, but let's verify
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.log(`  ⚠️  Profile not found, creating manually...`);
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: user.email,
              role: user.role,
            });

          if (insertError) {
            console.error(`  ❌ Error creating profile:`, insertError.message);
          } else {
            console.log(`  ✅ Profile created`);
          }
        } else {
          console.log(`  ✅ Profile exists with role: ${profile.role}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Exception creating ${user.email}:`, err.message);
    }

    console.log('');
  }

  console.log('✅ Seeding complete!\n');
  console.log('Test users:');
  testUsers.forEach(u => {
    console.log(`  - ${u.email} / password123 (${u.role})`);
  });
}

seedUsers().catch(console.error);
