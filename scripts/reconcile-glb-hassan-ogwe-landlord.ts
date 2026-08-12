/**
 * Applies the user-confirmed GLB ownership structure for the reviewed 19* and
 * 20* legacy tracker houses. Hassan Ogwe remains the resident-landlord at
 * GLB-21 and is the non-resident landlord for the listed rental units.
 *
 * The legacy tracker does not establish ownership acquisition dates. The
 * assignment date therefore uses the first documented current occupancy date
 * and is explicitly tagged as unverified ownership-start data.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const houses = [
  { house_number: '19', first_documented_occupancy: '2023-11-01' },
  { house_number: '19?', first_documented_occupancy: '2024-11-01' },
  { house_number: '19AF-1', first_documented_occupancy: '2019-12-01' },
  { house_number: '19AF-2', first_documented_occupancy: '2019-12-01' },
  { house_number: '19AF-3', first_documented_occupancy: '2021-01-01' },
  { house_number: '19BF-2', first_documented_occupancy: '2020-01-01' },
  { house_number: '19CF-3', first_documented_occupancy: '2015-12-01' },
  { house_number: '20F-1', first_documented_occupancy: '2023-01-01' },
  { house_number: '20F-3', first_documented_occupancy: '2019-11-01' },
  { house_number: '20F-4', first_documented_occupancy: '2024-08-01' },
  { house_number: '20F-5', first_documented_occupancy: '2024-06-01' },
  { house_number: '20F-9', first_documented_occupancy: '2022-08-01' },
];

const sourceNote = 'Legacy tracker import 2026-08-11: user confirmed Hassan Ogwe as landlord for GLB 19* and reviewed GLB 20* rental houses. Ownership acquisition date is not stated; assignment date is the first documented occupancy date and is tagged as unverified.';

async function appendNote(residentId: string, note: string) {
  const { data, error } = await supabase.from('residents').select('notes').eq('id', residentId).single();
  if (error) throw error;
  if (data.notes?.includes(note)) return;
  const notes = data.notes?.trim() ? `${data.notes.trim()}\n\n${note}` : note;
  const { error: updateError } = await supabase.from('residents').update({ notes }).eq('id', residentId);
  if (updateError) throw updateError;
}

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'GLB').single();
  if (streetError) throw streetError;

  const { data: hassan, error: hassanError } = await supabase
    .from('residents')
    .select('id,first_name,last_name')
    .eq('first_name', 'HASSAN')
    .eq('last_name', 'OGWE')
    .single();
  if (hassanError || !hassan) throw hassanError ?? new Error('Canonical Hassan Ogwe record is missing.');

  const { data: houseRows, error: houseError } = await supabase
    .from('houses')
    .select('id,house_number')
    .eq('street_id', street.id)
    .in('house_number', houses.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const houseByNumber = new Map((houseRows ?? []).map((house) => [house.house_number, house.id]));
  if (houseByNumber.size !== houses.length) throw new Error('One or more reviewed GLB houses are missing.');

  const houseIds = [...houseByNumber.values()];
  const { data: activeAssignments, error: assignmentError } = await supabase
    .from('resident_houses')
    .select('id,house_id,resident_id,resident_role,residents!resident_houses_resident_id_fkey(first_name,last_name)')
    .in('house_id', houseIds)
    .eq('is_active', true);
  if (assignmentError) throw assignmentError;

  const plans = houses.map((entry) => {
    const houseId = houseByNumber.get(entry.house_number)!;
    const currentLandlords = (activeAssignments ?? []).filter((assignment) => assignment.house_id === houseId && assignment.resident_role === 'non_resident_landlord');
    const hassanAssignment = currentLandlords.find((assignment) => assignment.resident_id === hassan.id);
    return { ...entry, house_id: houseId, hassan_assignment_id: hassanAssignment?.id ?? null, superseded_assignment_ids: currentLandlords.filter((assignment) => assignment.resident_id !== hassan.id).map((assignment) => assignment.id) };
  });

  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', canonical_landlord: hassan, plans }, null, 2));

  for (const plan of plans) {
    if (plan.superseded_assignment_ids.length) {
      const { error } = await supabase
        .from('resident_houses')
        .update({ is_active: false, move_out_date: '2026-08-11', tags: ['legacy-import', 'superseded-landlord-assignment'] })
        .in('id', plan.superseded_assignment_ids);
      if (error) throw error;
    }

    if (plan.hassan_assignment_id) {
      const { error } = await supabase
        .from('resident_houses')
        .update({
          resident_role: 'non_resident_landlord',
          is_primary: false,
          is_live_in: false,
          is_active: true,
          move_in_date: plan.first_documented_occupancy,
          tags: ['legacy-import', 'confirmed-landlord', 'ownership-start-unverified'],
        })
        .eq('id', plan.hassan_assignment_id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('resident_houses').insert({
        resident_id: hassan.id,
        house_id: plan.house_id,
        resident_role: 'non_resident_landlord',
        is_primary: false,
        is_live_in: false,
        is_active: true,
        move_in_date: plan.first_documented_occupancy,
        tags: ['legacy-import', 'confirmed-landlord', 'ownership-start-unverified'],
      });
      if (error) throw error;
    }
  }

  for (const assignment of activeAssignments ?? []) {
    if (assignment.resident_role !== 'non_resident_landlord' || assignment.resident_id === hassan.id) continue;
    const resident = assignment.residents as unknown as { first_name: string; last_name: string };
    await appendNote(assignment.resident_id, `Legacy tracker import 2026-08-11: retained resident record; GLB landlord assignment superseded by user-confirmed Hassan Ogwe (${resident.first_name} ${resident.last_name}).`);
  }
  await appendNote(hassan.id, sourceNote);
  console.log(JSON.stringify({ mode: 'apply', landlord: 'HASSAN OGWE', houses_updated: plans.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
