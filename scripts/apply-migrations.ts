import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const supabaseUrl = 'https://kzugmyjjqttardhfejzc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dWdteWpqcXR0YXJkaGZlanpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTIzNTM5MywiZXhwIjoyMDgwODExMzkzfQ.2t5OoWDl7RgH1djZi3F6JPOsrQqRv0G18YSMpUtWJfQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

async function applyMigrations() {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`Found ${files.length} migration files`);

  for (const file of files) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf-8');

    console.log(`\nApplying ${file}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

      if (error) {
        console.error(`❌ Error applying ${file}:`, error);
      } else {
        console.log(`✅ Successfully applied ${file}`);
      }
    } catch (err) {
      console.error(`❌ Exception applying ${file}:`, err);
    }
  }
}

applyMigrations().catch(console.error);
