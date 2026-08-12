/** Applies confirmed OJO.K 12-series tenant move-in dates and Tim Akenroye owner links. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');
const cases = [
  { house_number: '12BQ', move_in_date: '2024-04-01' },
  { house_number: '12F-1', move_in_date: '2025-03-01' },
  { house_number: '12F-2', move_in_date: '2025-01-01' },
  { house_number: '12F-4', move_in_date: '2018-10-01' },
];
const ownerNote = 'Legacy tracker import 2026-08-11: user confirmed Tim Akenroye as landlord for the OJO.K 12-series. Ownership acquisition date is not stated; linked dates follow the documented tenant move-in dates and are tagged unverified.';
async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single(); if (streetError) throw streetError;
  const { data: tim, error: timError } = await supabase.from('residents').select('id,notes').eq('first_name', 'TIM AKENROYE').eq('last_name', 'LANDLORD').single(); if (timError || !tim) throw timError ?? new Error('Tim Akenroye missing.');
  const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', cases.map(x => x.house_number)); if (houseError) throw houseError;
  const byNumber = new Map((houses ?? []).map(h => [h.house_number, h.id]));
  const plans = [];
  for (const entry of cases) { const houseId = byNumber.get(entry.house_number); if (!houseId) throw new Error(`Missing ${entry.house_number}`); const { data: rows, error } = await supabase.from('resident_houses').select('id,resident_id,resident_role').eq('house_id', houseId).eq('is_active', true); if (error) throw error; const tenant = rows?.find(r => r.resident_role === 'tenant'); if (!tenant) throw new Error(`Tenant missing at ${entry.house_number}`); plans.push({ ...entry, house_id: houseId, tenant_assignment_id: tenant.id, owner_assignment_id: rows?.find(r => r.resident_id === tim.id)?.id ?? null }); }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', plans }, null, 2));
  for (const plan of plans) { const { error: tenantError } = await supabase.from('resident_houses').update({ move_in_date: plan.move_in_date }).eq('id', plan.tenant_assignment_id); if (tenantError) throw tenantError; if (plan.owner_assignment_id) { const { error } = await supabase.from('resident_houses').update({ resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, move_in_date: plan.move_in_date, tags: ['legacy-import','confirmed-landlord','ownership-start-unverified'] }).eq('id', plan.owner_assignment_id); if (error) throw error; } else { const { error } = await supabase.from('resident_houses').insert({ resident_id: tim.id, house_id: plan.house_id, resident_role: 'non_resident_landlord', is_primary: false, is_live_in: false, is_active: true, move_in_date: plan.move_in_date, tags: ['legacy-import','confirmed-landlord','ownership-start-unverified'] }); if (error) throw error; } }
  if (!tim.notes?.includes(ownerNote)) { const notes = tim.notes?.trim() ? `${tim.notes.trim()}\n\n${ownerNote}` : ownerNote; const { error } = await supabase.from('residents').update({ notes }).eq('id', tim.id); if (error) throw error; }
  console.log(JSON.stringify({ mode: 'apply', updated: plans.length }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
