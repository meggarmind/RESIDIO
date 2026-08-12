/** Applies confirmed OJO.K 11-flat tenant and House 12 resident-landlord corrections. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const cases = [
  { house_number: '11F-2', role: 'tenant', move_in_date: '2018-08-01' },
  { house_number: '11F-3', role: 'tenant', move_in_date: '2023-08-01' },
  { house_number: '11F-4', role: 'tenant', move_in_date: '2020-03-01' },
  { house_number: '11F-4b', role: 'tenant', move_in_date: '2022-11-01' },
  { house_number: '12', role: 'resident_landlord', move_in_date: '2015-01-01' },
] as const;

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError || !street) throw streetError ?? new Error('OJO.K street is missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const byNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));
  const plans = [];
  for (const entry of cases) {
    const houseId = byNumber.get(entry.house_number);
    if (!houseId) throw new Error(`Missing OJO.K ${entry.house_number}.`);
    const { data: active, error } = await supabase.from('resident_houses').select('id,resident_role,is_primary,is_live_in,move_in_date').eq('house_id', houseId).eq('is_active', true);
    if (error) throw error;
    if ((active ?? []).length !== 1) throw new Error(`Expected exactly one active assignment at ${entry.house_number}; found ${(active ?? []).length}.`);
    plans.push({ ...entry, assignment_id: active![0].id });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { error } = await supabase.from('resident_houses').update({
      resident_role: plan.role,
      is_primary: true,
      is_live_in: true,
      move_in_date: plan.move_in_date,
      tags: ['legacy-import', plan.role === 'tenant' ? 'confirmed-tenant' : 'confirmed-resident-landlord'],
    }).eq('id', plan.assignment_id);
    if (error) throw error;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
