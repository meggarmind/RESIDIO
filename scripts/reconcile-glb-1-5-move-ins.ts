/** Applies documented GLB 1–5 move-in dates without changing existing roles. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const cases = [
  ['1A','2023-04-01'], ['1B','2024-04-01'], ['2A','2023-07-01'], ['2B','2019-12-01'], ['3A','2023-02-01'],
  ['3B','2023-08-01'], ['4','2018-01-01'], ['5A','2025-09-01'], ['5B','2019-04-01'],
] as const;
async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'GLB').single();
  if (streetError || !street) throw streetError ?? new Error('GLB street is missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map(([number]) => number));
  if (houseError) throw houseError;
  const plans = [];
  for (const [house_number, move_in_date] of cases) {
    const house = houses?.find((unit) => unit.house_number === house_number); if (!house) throw new Error(`Missing GLB ${house_number}.`);
    const { data: active, error } = await supabase.from('resident_houses').select('id,resident_role,move_in_date').eq('house_id', house.id).eq('is_active', true).eq('is_primary', true);
    if (error) throw error; if ((active ?? []).length !== 1) throw new Error(`Expected one primary at ${house_number}.`);
    plans.push({ house_number, move_in_date, assignment_id: active![0].id, current: active![0] });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) { const { error } = await supabase.from('resident_houses').update({ move_in_date: plan.move_in_date, tags: ['legacy-import','tracker-move-in-confirmed'] }).eq('id', plan.assignment_id); if (error) throw error; }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
