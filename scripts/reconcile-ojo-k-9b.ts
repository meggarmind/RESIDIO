/** User-confirmed decomposition of the legacy-combined OJO.K-9B resident row. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const note = 'Legacy import 2026-08-11: decomposed the former combined resident row using the user-confirmed canonical tenant, linked secondary resident, and non-resident landlord.';

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError) throw streetError;
  const { data: house, error: houseError } = await supabase.from('houses').select('id').eq('street_id', street.id).eq('house_number', '9B').single();
  if (houseError) throw houseError;
  const { data: assignment, error: assignmentError } = await supabase
    .from('resident_houses')
    .select('id,resident_id,residents!resident_houses_resident_id_fkey(id,first_name,last_name,notes)')
    .eq('house_id', house.id).eq('is_active', true).single();
  if (assignmentError) throw assignmentError;
  const original = assignment.residents as unknown as { id: string; notes: string | null };
  const result = { mode: apply ? 'apply' : 'dry-run', house: 'OJO.K-9B', operations: ['rename combined record to Ernest Obaseki / tenant', 'create Daisy Obaseki as linked secondary', 'create Olumide Olawole Agu as non-resident landlord', 'add Ernest Agho Johnbull payment alias'] };
  if (!apply) return console.log(JSON.stringify(result));

  const { error: updateResidentError } = await supabase.from('residents').update({
    first_name: 'Ernest', last_name: 'Obaseki', notes: original.notes?.trim() ? `${original.notes.trim()}\n\n${note}` : note,
  }).eq('id', original.id);
  if (updateResidentError) throw updateResidentError;
  const { error: updateAssignmentError } = await supabase.from('resident_houses').update({
    resident_role: 'tenant', is_primary: true, move_in_date: '2020-12-01', sponsor_resident_id: null,
  }).eq('id', assignment.id);
  if (updateAssignmentError) throw updateAssignmentError;

  const createResident = async (first_name: string, last_name: string, phone_primary: string, notes: string) => {
    const { data, error } = await supabase.from('residents').insert({ first_name, last_name, phone_primary, notes, verification_status: 'verified' }).select('id').single();
    if (error) throw error;
    return data;
  };
  const daisy = await createResident('Daisy', 'Obaseki', 'LEGACY-NO-PHONE-DAISY-OBASEKI', `${note} Phone not supplied in legacy tracker.`);
  const olamide = await createResident('Olumide', 'Olawole Agu', 'LEGACY-NO-PHONE-OLUMIDE-OLAWOLE-AGU', `${note} Phone not supplied in legacy tracker.`);
  const { error: daisyAssignmentError } = await supabase.from('resident_houses').insert({
    resident_id: daisy.id, house_id: house.id, resident_role: 'household_member', is_primary: false, is_active: true,
    move_in_date: '2020-12-01', sponsor_resident_id: original.id, is_live_in: true,
  });
  if (daisyAssignmentError) throw daisyAssignmentError;
  const { error: landlordAssignmentError } = await supabase.from('resident_houses').insert({
    resident_id: olamide.id, house_id: house.id, resident_role: 'non_resident_landlord', is_primary: true, is_active: true,
    move_in_date: '2018-12-01', is_live_in: false,
  });
  if (landlordAssignmentError) throw landlordAssignmentError;
  const { error: aliasError } = await supabase.from('resident_payment_aliases').insert({
    resident_id: original.id, alias_name: 'Ernest Agho Johnbull', is_active: true, notes: 'Legacy tracker import 2026-08-11; user-confirmed payment alias.',
  });
  if (aliasError) throw aliasError;
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
