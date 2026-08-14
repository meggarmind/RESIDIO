/** Applies two user-confirmed landlord corrections from the legacy ledger. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

type ReconciliationCase = {
  street: string;
  house: string;
  landlord: readonly [string, string];
  first_documented_occupancy: string;
  alias?: string;
};

const cases: readonly ReconciliationCase[] = [
  { street: 'IBB', house: '33', landlord: ['ALPHONSUS', 'OKORO'], first_documented_occupancy: '2023-07-01', alias: 'CHIEF OKORO' },
  { street: 'GLB', house: '5B', landlord: ['WILLIAM RACHEAL', 'TI'], first_documented_occupancy: '2019-04-01' },
] as const;
const ownerNote = 'Legacy tracker import 2026-08-11: user-confirmed non-resident landlord; ownership acquisition date is not stated, so this assignment uses the first documented occupancy date and is tagged unverified.';

async function main() {
  const plans = [];
  for (const entry of cases) {
    const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', entry.street).single();
    if (streetError) throw streetError;
    const { data: house, error: houseError } = await supabase.from('houses').select('id').eq('street_id', street.id).eq('house_number', entry.house).single();
    if (houseError) throw houseError;
    const { data: assignments, error: assignmentError } = await supabase.from('resident_houses').select('id,resident_id,resident_role,residents!resident_houses_resident_id_fkey(first_name,last_name,notes)').eq('house_id', house.id).eq('is_active', true);
    if (assignmentError) throw assignmentError;
    const landlord = assignments?.find((assignment) => { const r = assignment.residents as unknown as { first_name: string; last_name: string }; return r.first_name === entry.landlord[0] && r.last_name === entry.landlord[1]; });
    if (!landlord) throw new Error(`Landlord ${entry.landlord.join(' ')} is missing at ${entry.street}-${entry.house}.`);
    const aliasAssignment = entry.alias ? assignments?.find((assignment) => assignment.resident_id !== landlord.resident_id) : null;
    plans.push({ ...entry, landlord_assignment_id: landlord.id, landlord_resident_id: landlord.resident_id, alias_assignment: aliasAssignment ?? null });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { error: landlordError } = await supabase.from('resident_houses').update({ resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, move_in_date: plan.first_documented_occupancy, tags: ['legacy-import', 'confirmed-landlord', 'ownership-start-unverified'] }).eq('id', plan.landlord_assignment_id);
    if (landlordError) throw landlordError;
    const { data: landlordResident, error: readError } = await supabase.from('residents').select('notes').eq('id', plan.landlord_resident_id).single();
    if (readError) throw readError;
    if (!landlordResident.notes?.includes(ownerNote)) { const notes = landlordResident.notes?.trim() ? `${landlordResident.notes.trim()}\n\n${ownerNote}` : ownerNote; const { error } = await supabase.from('residents').update({ notes }).eq('id', plan.landlord_resident_id); if (error) throw error; }
    if (!plan.alias || !plan.alias_assignment) continue;
    const { data: existingAlias, error: aliasReadError } = await supabase.from('resident_payment_aliases').select('id').eq('resident_id', plan.landlord_resident_id).eq('alias_name', plan.alias).maybeSingle();
    if (aliasReadError) throw aliasReadError;
    if (!existingAlias) { const { error } = await supabase.from('resident_payment_aliases').insert({ resident_id: plan.landlord_resident_id, alias_name: plan.alias, is_active: true, notes: 'Legacy tracker import 2026-08-11; user-confirmed payment alias.' }); if (error) throw error; }
    const aliasResident = plan.alias_assignment.residents as unknown as { notes: string | null };
    const aliasNote = 'Legacy tracker import 2026-08-11: preserved record; user confirmed Chief Okoro is a payment alias for Alphonsus Okoro. House assignment deactivated; use resident_payment_aliases for matching.';
    const { error: deactivateError } = await supabase.from('resident_houses').update({ is_active: false, move_out_date: '2026-08-11', tags: ['legacy-import', 'alias-only-record'] }).eq('id', plan.alias_assignment.id);
    if (deactivateError) throw deactivateError;
    if (!aliasResident.notes?.includes(aliasNote)) { const notes = aliasResident.notes?.trim() ? `${aliasResident.notes.trim()}\n\n${aliasNote}` : aliasNote; const { error } = await supabase.from('residents').update({ notes }).eq('id', plan.alias_assignment.resident_id); if (error) throw error; }
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
