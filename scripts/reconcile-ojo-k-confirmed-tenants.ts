/** Applies user-confirmed tenant roles and blue-cell move-in dates for OJO.K units. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const cases = [
  { house_number: '20F-2', move_in_date: '2025-08-01' },
  { house_number: '22F-1', move_in_date: '2022-10-01' },
  { house_number: '22F-4', move_in_date: '2020-02-01' },
  { house_number: '22F-1b', move_in_date: '2021-08-01' },
  { house_number: '23', move_in_date: '2024-08-01' },
];
async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError || !street) throw streetError ?? new Error('OJO.K street is missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const ids = (houses ?? []).map((house) => house.id);
  if (ids.length !== cases.length) throw new Error(`Expected ${cases.length} units; found ${ids.length}.`);
  const { data: active, error: activeError } = await supabase.from('resident_houses').select('id,house_id,resident_role').in('house_id', ids).eq('is_active', true);
  if (activeError) throw activeError;
  const byHouse = new Map((active ?? []).map((row) => [row.house_id, row]));
  const plans = cases.map((entry) => {
    const house = houses!.find((unit) => unit.house_number === entry.house_number)!;
    const assignment = byHouse.get(house.id);
    if (!assignment) throw new Error(`No active assignment at ${entry.house_number}.`);
    return { ...entry, assignment_id: assignment.id };
  });
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { error } = await supabase.from('resident_houses').update({ resident_role: 'tenant', is_primary: true, is_live_in: true, move_in_date: plan.move_in_date, tags: ['legacy-import', 'confirmed-tenant'] }).eq('id', plan.assignment_id);
    if (error) throw error;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
