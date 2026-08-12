/** Applies the user-confirmed resident-landlord roles and January 2019 starts for OJO.K Houses 4 and 6. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const houses = ['4', '6'];

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError || !street) throw streetError ?? new Error('OJO.K street is missing.');
  const { data: units, error: unitError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', houses);
  if (unitError) throw unitError;
  const { data: assignments, error: assignmentError } = await supabase.from('resident_houses').select('id,house_id').in('house_id', (units ?? []).map((unit) => unit.id)).eq('is_active', true);
  if (assignmentError) throw assignmentError;
  if ((assignments ?? []).length !== 2) throw new Error(`Expected two active assignments; found ${(assignments ?? []).length}.`);
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', assignments }, null, 2));
  for (const assignment of assignments!) {
    const { error } = await supabase.from('resident_houses').update({ resident_role: 'resident_landlord', is_primary: true, is_live_in: true, move_in_date: '2019-01-01', tags: ['legacy-import', 'confirmed-resident-landlord'] }).eq('id', assignment.id);
    if (error) throw error;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: assignments!.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
