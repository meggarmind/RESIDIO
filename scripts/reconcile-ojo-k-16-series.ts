/** Applies the user-confirmed resident-landlord status and occupancy starts for OJO.K 16-series houses. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const cases = [
  { house_number: '16A', move_in_date: '2025-09-01' },
  { house_number: '16B', move_in_date: '2022-08-01', resident_name: { first_name: 'SONUBI BOLANLE PRINCE', last_name: 'RICHARD' } },
  { house_number: '16C', move_in_date: '2023-09-01' },
  { house_number: '16D', move_in_date: '2022-06-01' },
  { house_number: '16E', move_in_date: '2023-05-01', resident_name: { first_name: 'BENSON ODUN', last_name: 'TONDEA' } },
  { house_number: '16F', move_in_date: '2025-03-01' },
];

async function main() {
  const { data: street, error: streetError } = await supabase
    .from('streets')
    .select('id')
    .eq('short_name', 'OJO.K')
    .single();
  if (streetError || !street) throw streetError ?? new Error('OJO.K street is missing.');

  const { data: houses, error: houseError } = await supabase
    .from('houses')
    .select('id,house_number')
    .eq('street_id', street.id)
    .in('house_number', cases.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const byNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));

  const plans = [];
  for (const entry of cases) {
    const houseId = byNumber.get(entry.house_number);
    if (!houseId) throw new Error(`Missing OJO.K ${entry.house_number}.`);
    const { data: assignments, error: assignmentError } = await supabase
      .from('resident_houses')
      .select('id,resident_id,resident_role,is_primary,is_live_in,move_in_date')
      .eq('house_id', houseId)
      .eq('is_active', true);
    if (assignmentError) throw assignmentError;
    if ((assignments ?? []).length !== 1) {
      throw new Error(`Expected one active assignment at OJO.K ${entry.house_number}; found ${(assignments ?? []).length}.`);
    }
    plans.push({ ...entry, house_id: houseId, assignment: assignments![0] });
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
    return;
  }

  for (const plan of plans) {
    const { error: assignmentError } = await supabase
      .from('resident_houses')
      .update({
        resident_role: 'resident_landlord',
        is_primary: true,
        is_live_in: true,
        move_in_date: plan.move_in_date,
        tags: ['legacy-import', 'confirmed-resident-landlord'],
      })
      .eq('id', plan.assignment.id);
    if (assignmentError) throw assignmentError;

    if (plan.resident_name) {
      const { error: residentError } = await supabase
        .from('residents')
        .update(plan.resident_name)
        .eq('id', plan.assignment.resident_id);
      if (residentError) throw residentError;
    }
  }

  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
