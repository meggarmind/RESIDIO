/** Resolves the next user-confirmed, previously held-back alias/name cases. */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !key) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

type Item = { street: string; house: string; current: string; corrected?: [string, string]; aliases: string[]; deactivateAliases?: string[] };
const items: Item[] = [
  { street: 'IBB', house: '16', current: 'ODUBUGWU JUSTIN CHIDERA', aliases: ['Azubuike Justin'] },
  { street: 'IBB', house: '25', current: 'MARKSON HEMBADOON', corrected: ['Markson', 'Nembadoon'], aliases: ['Best'] },
  { street: 'IBB', house: '26F-1', current: 'ANYANWU CHINEDU KINGSLEY', corrected: ['Anyanwu Chinenyi', 'Kingsley'], aliases: ['Olufunke Titilola'], deactivateAliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '26F-3', current: 'IKOLI', corrected: ['Mrs', 'Ikoli'], aliases: ['Olufunke Titilola'], deactivateAliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '26F-4', current: 'TOLULOPE AYODELE', corrected: ['Toliluope', 'Ayodele'], aliases: ['Olufunke Titilola'], deactivateAliases: ['Olufunke Titilola'] },
  { street: 'GLB', house: '19CF-3', current: 'GINIKA ASIEGBU MIS', aliases: ['Asiegbu David'] },
  { street: 'KOA', house: '13B', current: 'ASUQUO EDET EDAK INIUKIM', corrected: ['Asuquo Edet', 'Edak Inukim'], aliases: ['Escodak Investments'] },
  { street: 'KOA', house: '15', current: 'STELLA AKINTADE', corrected: ['Stella', 'Akintunde'], aliases: ['Jomea Investment A'] },
];
const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
const name = (r: { first_name: string; last_name: string }) => `${r.first_name} ${r.last_name}`.trim();
const notePrefix = 'Legacy import 2026-08-11: preserved record; confirmed payment alias';

async function main() {
  const { data: streets, error } = await supabase.from('streets').select('id,short_name'); if (error) throw error;
  const results: string[] = [];
  for (const item of items) {
    const street = streets?.find((s) => s.short_name === item.street); if (!street) throw new Error(`Street missing: ${item.street}`);
    const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id); if (houseError) throw houseError;
    const house = houses?.find((h) => norm(h.house_number) === norm(item.house)); if (!house) throw new Error(`House missing: ${item.street}-${item.house}`);
    const { data: assignments, error: assignError } = await supabase.from('resident_houses')
      .select('id,resident_id,is_active,residents!resident_houses_resident_id_fkey(id,first_name,last_name,notes)')
      .eq('house_id', house.id); if (assignError) throw assignError;
    const canonicalAssignment = assignments?.find((a) => { const r = a.residents as unknown as { first_name:string;last_name:string } | null; return r && norm(name(r)) === norm(item.current); });
    if (!canonicalAssignment) throw new Error(`Canonical record missing: ${item.street}-${item.house} / ${item.current}`);
    const canonical = canonicalAssignment.residents as unknown as { id:string;first_name:string;last_name:string;notes:string|null };
    results.push(`${item.street}-${item.house}: ${item.aliases.join(', ')} -> ${item.corrected ? item.corrected.join(' ') : name(canonical)}`);
    if (!apply) continue;
    if (item.corrected) { const { error: updateError } = await supabase.from('residents').update({ first_name:item.corrected[0], last_name:item.corrected[1] }).eq('id', canonical.id); if (updateError) throw updateError; }
    for (const aliasName of item.aliases) {
      const { data: exists, error: existsError } = await supabase.from('resident_payment_aliases').select('id').eq('resident_id', canonical.id).eq('alias_name', aliasName).maybeSingle(); if (existsError) throw existsError;
      if (!exists) { const { error: insertError } = await supabase.from('resident_payment_aliases').insert({ resident_id:canonical.id, alias_name:aliasName, is_active:true, notes:'Legacy tracker import 2026-08-11; user-confirmed payment alias.' }); if (insertError) throw insertError; }
      if (item.deactivateAliases?.some((v) => norm(v) === norm(aliasName))) {
        const aliasAssignment = assignments?.find((a) => { const r = a.residents as unknown as {first_name:string;last_name:string}|null; return r && a.resident_id !== canonical.id && norm(name(r)) === norm(aliasName) && a.is_active; });
        if (aliasAssignment) {
          const aliasResident = aliasAssignment.residents as unknown as { id:string;notes:string|null };
          const note = `${notePrefix} for ${item.corrected?.join(' ') ?? name(canonical)}. House assignment deactivated; use resident_payment_aliases for matching.`;
          const { error: deactivateError } = await supabase.from('resident_houses').update({is_active:false,move_out_date:'2026-08-11'}).eq('id',aliasAssignment.id); if(deactivateError) throw deactivateError;
          if (!aliasResident.notes?.includes(notePrefix)) { const { error: noteError } = await supabase.from('residents').update({notes:aliasResident.notes?.trim()?`${aliasResident.notes.trim()}\n\n${note}`:note}).eq('id',aliasResident.id); if(noteError) throw noteError; }
        }
      }
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',results},null,2));
}
main().catch((e)=>{console.error(e instanceof Error?e.message:e);process.exit(1)});
