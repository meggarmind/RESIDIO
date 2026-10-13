import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

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
