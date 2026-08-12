/**
 * Keeps the corporate entity as current tenant and makes the named person the
 * non-resident landlord for user-confirmed IBB corporate/entity properties.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const sourceNote = 'Legacy tracker import 2026-08-11: user confirmed corporate entity remains the current resident and the named person is landlord.';

const cases = [
  { house_number: '32', corporation: 'ANGEL CREST', landlord: 'AKINTAYO OLAWUNMI ELIZABETH', move_in_date: '2015-01-01' },
  { house_number: '38', corporation: 'DEBIRUSS SCHOOL', landlord: 'SIMEON KAYODE ONI', move_in_date: '2018-11-01' },
];
const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toUpperCase();

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'IBB').single();
  if (streetError) throw streetError;
  const { data: houses, error: housesError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map((entry) => entry.house_number));
  if (housesError) throw housesError;
  const houseByNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));
  const plans = [];
  for (const entry of cases) {
    const houseId = houseByNumber.get(entry.house_number);
    if (!houseId) throw new Error(`IBB-${entry.house_number} is missing.`);
    const { data: assignments, error: assignmentError } = await supabase.from('resident_houses').select('id,resident_id,resident_role,is_primary,is_live_in,is_active,move_in_date,residents!resident_houses_resident_id_fkey(id,first_name,last_name,company_name,entity_type,notes)').eq('house_id', houseId).eq('is_active', true);
    if (assignmentError) throw assignmentError;
    const corporate = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string; company_name: string | null };
      return normalise(`${resident.first_name} ${resident.last_name}`) === normalise(entry.corporation)
        || normalise(resident.company_name ?? '') === normalise(entry.corporation);
    });
    const landlord = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string };
      return normalise(`${resident.first_name} ${resident.last_name}`) === normalise(entry.landlord);
    });
    if (!corporate || !landlord) throw new Error(`Expected active corporate and landlord records are missing for IBB-${entry.house_number}.`);
    plans.push({ ...entry, house_id: houseId, corporate_assignment_id: corporate.id, landlord_assignment_id: landlord.id, corporate_resident_id: corporate.resident_id, landlord_resident_id: landlord.resident_id });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }));
  for (const plan of plans) {
    const { error: corporationResidentError } = await supabase.from('residents').update({ first_name: plan.corporation, last_name: '', company_name: plan.corporation, entity_type: 'corporate' }).eq('id', plan.corporate_resident_id);
    if (corporationResidentError) throw corporationResidentError;
    const { error: corporateAssignmentError } = await supabase.from('resident_houses').update({ resident_role: 'tenant', is_primary: true, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-current-resident'] }).eq('id', plan.corporate_assignment_id);
    if (corporateAssignmentError) throw corporateAssignmentError;
    const { error: landlordAssignmentError } = await supabase.from('resident_houses').update({ resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-landlord'] }).eq('id', plan.landlord_assignment_id);
    if (landlordAssignmentError) throw landlordAssignmentError;
    const { data: landlord } = await supabase.from('residents').select('notes').eq('id', plan.landlord_resident_id).single();
    const notes = landlord?.notes?.trim() ? `${landlord.notes.trim()}\n\n${sourceNote}` : sourceNote;
    const { error: noteError } = await supabase.from('residents').update({ notes }).eq('id', plan.landlord_resident_id);
    if (noteError) throw noteError;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
