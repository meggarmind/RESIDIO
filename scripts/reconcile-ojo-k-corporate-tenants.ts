/** Reconciles the user-confirmed OJO.K corporate occupants with Christian Philips as landlord. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const cases = [
  { house_number: '14', corporation: 'HOUSE OF MERCY CHURCH', move_in_date: '2015-01-01' },
  { house_number: '14A', corporation: 'SHUSHAN PHARMACY', move_in_date: '2025-01-01' },
];
const sourceNote = 'Legacy tracker import 2026-08-11: user confirmed this corporate entity is the current billable tenant and Christian Philips is the non-resident landlord.';

async function appendNote(residentId: string) {
  const { data, error } = await supabase.from('residents').select('notes').eq('id', residentId).single();
  if (error) throw error;
  if (data.notes?.includes(sourceNote)) return;
  const notes = data.notes?.trim() ? `${data.notes.trim()}\n\n${sourceNote}` : sourceNote;
  const { error: updateError } = await supabase.from('residents').update({ notes }).eq('id', residentId);
  if (updateError) throw updateError;
}

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError) throw streetError;
  const { data: christian, error: christianError } = await supabase.from('residents').select('id').eq('first_name', 'CHRISTIAN').eq('last_name', 'PHILIPS').single();
  if (christianError || !christian) throw christianError ?? new Error('Christian Philips is missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map((entry) => entry.house_number));
  if (houseError) throw houseError;
  const houseByNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));
  const plans = [];
  for (const entry of cases) {
    const houseId = houseByNumber.get(entry.house_number);
    if (!houseId) throw new Error(`OJO.K-${entry.house_number} is missing.`);
    const { data: assignments, error } = await supabase.from('resident_houses').select('id,resident_id,resident_role,residents!resident_houses_resident_id_fkey(first_name,last_name,company_name)').eq('house_id', houseId).eq('is_active', true);
    if (error) throw error;
    const corporate = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string; company_name: string | null };
      return `${resident.first_name} ${resident.last_name}`.trim().toUpperCase() === entry.corporation || resident.company_name?.toUpperCase() === entry.corporation;
    });
    if (!corporate) throw new Error(`Expected ${entry.corporation} record is missing at OJO.K-${entry.house_number}.`);
    const landlord = assignments?.find((assignment) => assignment.resident_id === christian.id);
    plans.push({ ...entry, house_id: houseId, corporate_assignment_id: corporate.id, corporate_resident_id: corporate.resident_id, landlord_assignment_id: landlord?.id ?? null });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) {
    const { error: corporateError } = await supabase.from('resident_houses').update({ resident_role: 'tenant', is_primary: true, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-current-resident'] }).eq('id', plan.corporate_assignment_id);
    if (corporateError) throw corporateError;
    if (plan.landlord_assignment_id) {
      const { error } = await supabase.from('resident_houses').update({ resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-landlord'] }).eq('id', plan.landlord_assignment_id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('resident_houses').insert({ resident_id: christian.id, house_id: plan.house_id, resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, is_active: true, move_in_date: plan.move_in_date, tags: ['legacy-import', 'corporate-landlord'] });
      if (error) throw error;
    }
    await appendNote(christian.id);
  }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
