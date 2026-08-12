/**
 * Marks user-confirmed corporate transactors as active billable tenants where
 * no individual landlord was supplied by the legacy tracker/user.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const cases = [
  { street: 'IBB', house_number: '36A', entity: 'KEMCHUTA HOMES LIMITED', move_in_date: '2023-05-01' },
  { street: 'OJO.K', house_number: '9C', entity: 'PRAISE HOUSE', move_in_date: '2021-01-01' },
];
const sourceNote = 'Legacy tracker import 2026-08-11: user confirmed this entity transacts as the active corporate tenant. No individual landlord was supplied; ownership is intentionally left unassigned.';

async function main() {
  const plans = [];
  for (const entry of cases) {
    const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', entry.street).single();
    if (streetError) throw streetError;
    const { data: house, error: houseError } = await supabase.from('houses').select('id').eq('street_id', street.id).eq('house_number', entry.house_number).single();
    if (houseError) throw houseError;
    const { data: assignments, error: assignmentError } = await supabase.from('resident_houses').select('id,resident_id,residents!resident_houses_resident_id_fkey(first_name,last_name,company_name,notes)').eq('house_id', house.id).eq('is_active', true).eq('is_primary', true);
    if (assignmentError) throw assignmentError;
    const assignment = assignments?.[0];
    if (!assignment) throw new Error(`Active primary assignment missing for ${entry.street}-${entry.house_number}.`);
    plans.push({ ...entry, house_id: house.id, assignment_id: assignment.id, resident_id: assignment.resident_id });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { data: resident, error: residentError } = await supabase.from('residents').select('notes').eq('id', plan.resident_id).single();
    if (residentError) throw residentError;
    const notes = resident.notes?.includes(sourceNote) ? resident.notes : (resident.notes?.trim() ? `${resident.notes.trim()}\n\n${sourceNote}` : sourceNote);
    const { error: residentUpdateError } = await supabase.from('residents').update({ first_name: plan.entity, last_name: '', company_name: plan.entity, entity_type: 'corporate', notes }).eq('id', plan.resident_id);
    if (residentUpdateError) throw residentUpdateError;
    const { error: assignmentUpdateError } = await supabase.from('resident_houses').update({ resident_role: 'tenant', is_primary: true, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-current-resident', 'landlord-unassigned'] }).eq('id', plan.assignment_id);
    if (assignmentUpdateError) throw assignmentUpdateError;
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
