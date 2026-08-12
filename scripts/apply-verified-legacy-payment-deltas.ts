/** Inserts only the two payment deltas verified by the comparison manifest. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

const sources = [
  { house_number: '2', payment_date: '2025-12-01', amount: 30000, reference_number: 'LEGACY-OJO-K-2-2025-12', notes: 'Raw tracker payment: December 2025. Imported after house/year reconciliation.' },
  { house_number: '8', payment_date: '2024-03-01', amount: 60000, reference_number: 'LEGACY-OJO-K-8-2024-03', notes: 'Raw tracker payment: March 2024. Imported after house/year reconciliation.' },
];

async function main() {
  const { data: street, error: streetError } = await supabase.from('streets').select('id').eq('short_name', 'OJO.K').single();
  if (streetError) throw streetError;
  const { data: houses, error: housesError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id).in('house_number', sources.map((source) => source.house_number));
  if (housesError) throw housesError;
  const houseByNumber = new Map((houses ?? []).map((house) => [house.house_number, house.id]));
  const proposed = [];
  for (const source of sources) {
    const houseId = houseByNumber.get(source.house_number);
    if (!houseId) throw new Error(`Missing OJO.K-${source.house_number}.`);
    const { data: assignment, error: assignmentError } = await supabase.from('resident_houses').select('resident_id').eq('house_id', houseId).eq('resident_role', 'resident_landlord').eq('is_active', true).single();
    if (assignmentError) throw assignmentError;
    const { data: existing, error: existingError } = await supabase.from('payment_records').select('id').eq('reference_number', source.reference_number).maybeSingle();
    if (existingError) throw existingError;
    proposed.push({ ...source, house_id: houseId, resident_id: assignment.resident_id, exists: Boolean(existing) });
  }
  if (!apply) return console.log(JSON.stringify({ mode: 'dry-run', proposed }));
  const toInsert = proposed.filter((payment) => !payment.exists).map(({ exists, house_number, ...payment }) => ({ ...payment, status: 'paid', method: 'bank_transfer', is_verified: true }));
  if (toInsert.length) {
    const { error } = await supabase.from('payment_records').insert(toInsert);
    if (error) throw error;
  }
  console.log(JSON.stringify({ mode: 'apply', inserted: toInsert.length, skipped_existing: proposed.length - toInsert.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
