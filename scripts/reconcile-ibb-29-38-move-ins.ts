/** Applies tracker-confirmed IBB 29–38 move-in dates without changing existing roles. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const cases = [
  { house_number: '29A', move_in_date: '2019-07-01' },
  { house_number: '29ABQ', move_in_date: '2023-10-01' },
  { house_number: '29B', move_in_date: '2025-05-01' },
  { house_number: '31F-1', move_in_date: '2022-09-01' },
  { house_number: '31F-3', move_in_date: '2023-05-01' },
  { house_number: '31F-4', move_in_date: '2021-12-01' },
  { house_number: '32', move_in_date: '2015-06-01' },
  { house_number: '33', move_in_date: '2023-07-01' },
  { house_number: '36A', move_in_date: '2023-05-01' },
  { house_number: '36B', move_in_date: '2020-12-01' },
  { house_number: '38', move_in_date: '2018-11-01' },
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
    const { data: active, error } = await supabase.from('resident_houses').select('id,resident_role,move_in_date').eq('house_id', houseId).eq('is_active', true).eq('is_primary', true);
    if (error) throw error;
    if ((active ?? []).length !== 1) throw new Error(`Expected one active primary assignment at ${entry.house_number}; found ${(active ?? []).length}.`);
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
