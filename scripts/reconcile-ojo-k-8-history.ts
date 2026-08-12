/** Adds the user-confirmed OJO.K-8 occupancy history; defaults to dry-run. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } });
const apply = process.argv.includes('--apply');
const sourceNote = 'Legacy tracker import 2026-08-11: user-confirmed history. Landlord occupied Jan 2015–Dec 2020; tenant occupied Jan 2021–Dec 2022; house vacant in 2023; landlord returned Jan 2024.';

async function main() {
  const {data:street,error:streetError}=await supabase.from('streets').select('id').eq('short_name','OJO.K').single(); if(streetError)throw streetError;
  const {data:house,error:houseError}=await supabase.from('houses').select('id').eq('street_id',street.id).eq('house_number','8').single(); if(houseError)throw houseError;
  const {data:assignments,error:assignmentError}=await supabase.from('resident_houses').select('id,resident_id,resident_role,move_in_date,move_out_date,residents!resident_houses_resident_id_fkey(id,first_name,last_name,notes)').eq('house_id',house.id);if(assignmentError)throw assignmentError;
  const landlord=assignments?.find(a=>a.resident_role==='resident_landlord'); const tenant=assignments?.find(a=>a.resident_role==='tenant');
  if(!landlord||!tenant)throw new Error('Expected landlord and tenant assignments are missing.');
  const tenantResident=tenant.residents as unknown as {id:string;notes:string|null};
  const events=[
    {event_date:'2015-01-01',event_type:'move_in',resident_id:landlord.resident_id,resident_role:'resident_landlord',is_current:false,notes:sourceNote},
    {event_date:'2020-12-31',event_type:'move_out',resident_id:landlord.resident_id,resident_role:'resident_landlord',is_current:false,notes:sourceNote},
    {event_date:'2021-01-01',event_type:'move_in',resident_id:tenant.resident_id,resident_role:'tenant',is_current:false,notes:sourceNote},
    {event_date:'2022-12-31',event_type:'move_out',resident_id:tenant.resident_id,resident_role:'tenant',is_current:false,notes:sourceNote},
    {event_date:'2024-01-01',event_type:'move_in',resident_id:landlord.resident_id,resident_role:'resident_landlord',is_current:true,notes:sourceNote},
  ];
  if(!apply)return console.log(JSON.stringify({mode:'dry-run',events}));
  const {error:renameError}=await supabase.from('residents').update({last_name:'Uduakobo',notes:tenantResident.notes?.trim()?`${tenantResident.notes.trim()}\n\n${sourceNote}`:sourceNote}).eq('id',tenantResident.id); if(renameError)throw renameError;
  const {error:insertError}=await supabase.from('house_ownership_history').insert(events.map(event=>({...event,house_id:house.id})));if(insertError)throw insertError;
  console.log(JSON.stringify({mode:'apply',events:events.length}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1)});
