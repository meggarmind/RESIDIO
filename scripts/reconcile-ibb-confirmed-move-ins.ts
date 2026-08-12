/** Applies tracker-confirmed IBB move-in months without changing existing resident roles. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const cases = [
  { house_number: '18F-2', move_in_date: '2021-07-01' },
  { house_number: '18F-3', move_in_date: '2015-01-01' },
  { house_number: '18F-1', move_in_date: '2022-08-01' },
  { house_number: '20', move_in_date: '2025-05-01' },
  { house_number: '21A', move_in_date: '2025-05-01' },
  { house_number: '21C', move_in_date: '2024-09-01' },
  { house_number: '23B', move_in_date: '2024-08-01' },
  { house_number: '23C', move_in_date: '2024-03-01' },
];
async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'IBB').single();
  if (streetError || !street) throw streetError ?? new Error('IBB street is missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const byNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));
  const plans = [];
  for (const entry of cases) {
    const houseId = byNumber.get(entry.house_number);
    if (!houseId) throw new Error(`Missing IBB ${entry.house_number}.`);
    const { data: active, error } = await supabase.from('resident_houses').select('id,resident_role,move_in_date').eq('house_id', houseId).eq('is_active', true);
    if (error) throw error;
    if ((active ?? []).length !== 1) throw new Error(`Expected one active assignment at ${entry.house_number}; found ${(active ?? []).length}.`);
    plans.push({ ...entry, assignment_id: active![0].id, current: active![0] });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { error } = await supabase.from('resident_houses').update({ move_in_date: plan.move_in_date, tags: ['legacy-import', 'tracker-move-in-confirmed'] }).eq('id', plan.assignment_id);
    if (error) throw error;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
