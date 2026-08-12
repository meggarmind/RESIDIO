/** Applies user-confirmed secondary-resident links idempotently. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const houses = await supabase.from('houses').select('id,short_name').in('short_name', ['KOA-5', 'KOA-13A']);
  if (houses.error) throw houses.error;
  const houseByName = new Map((houses.data ?? []).map((house) => [house.short_name, house.id]));

  const residents = await supabase.from('residents').select('id,phone_primary').in('phone_primary', [
    'LEGACY-NO-PHONE-OLORUNTOLA-TEMI',
    'LEGACY-NO-PHONE-ANWULI-OKAFOR',
  ]);
  if (residents.error) throw residents.error;
  const residentByPhone = new Map((residents.data ?? []).map((resident) => [resident.phone_primary, resident.id]));

  const targets = [
    {
      residentId: residentByPhone.get('LEGACY-NO-PHONE-OLORUNTOLA-TEMI'),
      houseId: houseByName.get('KOA-5'),
      sponsorResidentId: '0c578aa1-7f3e-5c92-ba3e-fb227c0cfc0d',
      moveInDate: '2021-09-01',
    },
    {
      residentId: residentByPhone.get('LEGACY-NO-PHONE-ANWULI-OKAFOR'),
      houseId: houseByName.get('KOA-13A'),
      sponsorResidentId: '6d0f5eb9-8b91-59ba-b3c6-062de314178d',
      moveInDate: '2015-01-01',
    },
  ];

  for (const target of targets) {
    if (!target.residentId || !target.houseId) throw new Error('Secondary resident or house was not found.');
    const current = await supabase.from('resident_houses').select('id').eq('resident_id', target.residentId).eq('house_id', target.houseId).maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) {
      const inserted = await supabase.from('resident_houses').insert({
        resident_id: target.residentId,
        house_id: target.houseId,
        resident_role: 'household_member',
        is_primary: false,
        is_active: true,
        is_live_in: true,
        move_in_date: target.moveInDate,
        sponsor_resident_id: target.sponsorResidentId,
        tags: ['legacy-import', 'confirmed-linked-secondary'],
      });
      if (inserted.error) throw inserted.error;
    }
  }

  const fixed = await supabase.from('resident_houses').update({
    sponsor_resident_id: '102f4ee7-b0f3-552d-88e3-5b081095d55e',
    move_in_date: '2020-01-01',
    is_live_in: true,
    tags: ['legacy-import', 'confirmed-linked-secondary'],
  }).eq('id', 'c1515abe-c51c-512b-b67e-c12f2505fddc');
  if (fixed.error) throw fixed.error;

  const verified = await supabase.from('resident_houses').select(
    'resident_role,is_live_in,move_in_date,sponsor_resident_id,residents!resident_houses_resident_id_fkey(first_name,last_name,phone_primary)'
  ).in('resident_id', [...targets.map((target) => target.residentId), 'a326452a-53ae-55aa-966e-6e464d59fcb9']);
  if (verified.error) throw verified.error;
  console.log(JSON.stringify({ status: 'applied', targets: targets.length, repaired: 'Anosike Ezinne Angela', verified: verified.data }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
