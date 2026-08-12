/** Applies the confirmed KOA 10-series landlord structure and move-in dates. */
import dotenv from 'dotenv'; import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD; const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); const apply = process.argv.includes('--apply');
const tenantCases = [
  ['10F-?', '2025-06-01'], ['10F-1', '2020-01-01'], ['10F-2', '2024-11-01'], ['10F-3', '2020-09-01'], ['10F-4', '2021-08-01'], ['10F-6', '2022-12-01'],
] as const;
const note = 'Legacy tracker import 2026-08-11: user confirmed Boniface Obijiaku as landlord for the KOA 10-series. Ownership acquisition dates are not stated; rental links use documented tenant move-in dates and are tagged unverified.';
async function main() {
 const {data:street,error:se}=await supabase.from('streets').select('id').eq('short_name','KOA').single();if(se)throw se;
 const {data:boniface,error:be}=await supabase.from('residents').select('id,notes').eq('first_name','BONIFACE').eq('last_name','OBIJIAKU').single();if(be||!boniface)throw be??new Error('Boniface missing');
 const wanted=[...tenantCases.map(x=>x[0]),'10F-5']; const {data:houses,error:he}=await supabase.from('houses').select('id,house_number').eq('street_id',street.id).in('house_number',wanted);if(he)throw he; const by=new Map((houses??[]).map(h=>[h.house_number,h.id]));
 if(by.size!==wanted.length)throw new Error('A reviewed KOA 10-series house is missing');
 for(const [number,date] of tenantCases){const houseId=by.get(number)!;const{data:rows,error}=await supabase.from('resident_houses').select('id,resident_id,resident_role').eq('house_id',houseId).eq('is_active',true);if(error)throw error;const tenant=rows?.find(x=>x.resident_role==='tenant');if(!tenant)throw new Error(`Tenant missing at ${number}`);const owner=rows?.find(x=>x.resident_id===boniface.id);if(apply){let e=(await supabase.from('resident_houses').update({move_in_date:date}).eq('id',tenant.id)).error;if(e)throw e;if(owner){e=(await supabase.from('resident_houses').update({resident_role:'non_resident_landlord',is_primary:false,is_live_in:false,move_in_date:date,tags:['legacy-import','confirmed-landlord','ownership-start-unverified']}).eq('id',owner.id)).error;}else{e=(await supabase.from('resident_houses').insert({resident_id:boniface.id,house_id:houseId,resident_role:'non_resident_landlord',is_primary:false,is_live_in:false,is_active:true,move_in_date:date,tags:['legacy-import','confirmed-landlord','ownership-start-unverified']})).error;}if(e)throw e;}}
 const ownerHouse=by.get('10F-5')!;const{data:ownerRows,error:oe}=await supabase.from('resident_houses').select('id').eq('house_id',ownerHouse).eq('resident_id',boniface.id).eq('is_active',true).single();if(oe)throw oe;if(apply){const e=(await supabase.from('resident_houses').update({resident_role:'resident_landlord',is_primary:true,is_live_in:true,move_in_date:'2015-01-01',tags:['legacy-import','confirmed-resident-landlord']}).eq('id',ownerRows.id)).error;if(e)throw e;if(!boniface.notes?.includes(note)){const notes=boniface.notes?.trim()?`${boniface.notes.trim()}\n\n${note}`:note;const ne=(await supabase.from('residents').update({notes}).eq('id',boniface.id)).error;if(ne)throw ne;}}
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',tenant_flats:tenantCases.length,owner_unit:'10F-5'}));
} main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1)});
