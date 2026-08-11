/**
 * Applies user-confirmed payment aliases from the legacy reconciliation ledger.
 * Default is dry-run. Pass --apply to write. Any matching alias-only resident
 * assignment is preserved as a resident record but deactivated with a note.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !serviceRoleKey) throw new Error('Cloud Supabase configuration is unavailable.');
const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const apply = process.argv.includes('--apply');

type Entry = { street: string; house: string; canonical: string; aliases: string[] };
const entries: Entry[] = [
  { street: 'OJO.K', house: '6', canonical: 'SAMAILA ALEYIDEINO', aliases: ['Hamaniya Caleb'] },
  { street: 'OJO.K', house: '8', canonical: 'ESO MOBOLAJI AGBOO', aliases: ['Bolaji Kayode Eso'] },
  { street: 'OJO.K', house: '9A', canonical: 'TAOFIK OLADELE ABASS', aliases: ['Alh Abass', 'Azamid Consult', 'Alfred Adetola', 'Afolabi Bank-Olemoh'] },
  { street: 'OJO.K', house: '9B', canonical: 'ERNEST OBASEKI', aliases: ['Ernest Agho Johnbull'] },
  { street: 'OJO.K', house: '9C', canonical: 'PRAISE HOUSE', aliases: ['Lanyan Kunle', 'PHousey Ighalo', 'Margaret OS'] },
  { street: 'OJO.K', house: '11F-3', canonical: 'OFOR LOVETH UCHE', aliases: ['Ifodu Loveth Uche'] },
  { street: 'OJO.K', house: '11F-4', canonical: 'OMONAYAJO ELIZABETH ABISOLA', aliases: ['Olawunmi Elizabeth'] },
  { street: 'OJO.K', house: '12F-4', canonical: 'OYELEYE OYINDAMOLA', aliases: ['Tomisin Uyeleye'] },
  { street: 'IBB', house: '1', canonical: 'ADEGOKE TUNDE', aliases: ['Babatunde Oluwafemi Adegoke'] },
  { street: 'IBB', house: '3AF-4', canonical: 'CHIBUEZE NICHOLAS JAMES', aliases: ['James', 'Oyedare Gbenga David'] },
  { street: 'IBB', house: '5', canonical: 'CHIKE LAWRENCE OKEKE', aliases: ['7, 6 & 10 Interiors Ltd'] },
  { street: 'IBB', house: '10A', canonical: 'CHUKWUMA BRIGHT UNAEGBU', aliases: ['Golden Chidi'] },
  { street: 'IBB', house: '16', canonical: 'ODUBUGWU JUSTIN CHIDERA', aliases: ['Azubuike Justin'] },
  { street: 'IBB', house: '25', canonical: 'MARKSON NEMBADOON', aliases: ['Best'] },
  { street: 'IBB', house: '26F-1', canonical: 'ANYANWU CHINENYI KINGSLEY', aliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '26F-2', canonical: 'CHUKS MBONU', aliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '26F-3', canonical: 'MRS IKOLI', aliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '26F-4', canonical: 'TOLILUOPE AYODELE', aliases: ['Olufunke Titilola'] },
  { street: 'IBB', house: '31F-1', canonical: 'CHIGOZIE AGU', aliases: ['Lilian Chinenye', 'Rhemroyce Po POS'] },
  { street: 'IBB', house: '31F-3', canonical: 'VERONICA INYAN', aliases: ['Margaret Akpo', 'Rivers Geena Asuquo'] },
  { street: 'IBB', house: '36B', canonical: 'SHAKIRUDEEN OLANREWAJU', aliases: ['Bakre Olarenwaju Ishola'] },
  { street: 'GLB', house: '3A', canonical: 'MICHAEL IWUOHA', aliases: ['Trojans Merchandise'] },
  { street: 'GLB', house: '3B', canonical: 'IKENNA MBACHU', aliases: ['Alex Igiri Oyom'] },
  { street: 'GLB', house: '8', canonical: 'OKEREKE JAMES UKPA', aliases: ['James & Chidinma Okereke'] },
  { street: 'GLB', house: '9BF-1', canonical: 'OBINNA CHIKE UBACHUKWU', aliases: ['Chinedu Ubachukwu'] },
  { street: 'GLB', house: '17AFLT1', canonical: 'CHRISTOPHER OUNORAH OKAFOR', aliases: ['Christian Ounorah', 'Ochuagbachris Chinenye'] },
  { street: 'GLB', house: '19CF-3', canonical: 'GINIKA ASIEGBU', aliases: ['Asiegbu David'] },
  { street: 'KOA', house: '10F-?', canonical: 'EMMANUEL PELUMI OLAYINKA', aliases: ['Olayinka Victor'] },
  { street: 'KOA', house: '13B', canonical: 'ASUQUO EDET EDAK INUKIM', aliases: ['Escodak Investments'] },
  { street: 'KOA', house: '15', canonical: 'STELLA AKINTUNDE', aliases: ['Jomea Investment A'] },
  { street: 'KOA', house: '17', canonical: 'ABODUNDE YEMI', aliases: ['Abodunde Olayemi'] },
];

const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const displayName = (resident: { first_name: string; last_name: string }) => `${resident.first_name} ${resident.last_name}`.trim();

async function main() {
  const { data: streets, error: streetsError } = await supabase.from('streets').select('id,short_name');
  if (streetsError) throw streetsError;
  const output: { applied: string[]; unresolved: string[] } = { applied: [], unresolved: [] };

  for (const entry of entries) {
    const street = streets?.find((item) => item.short_name === entry.street);
    if (!street) { output.unresolved.push(`${entry.street}-${entry.house}: street missing`); continue; }
    const { data: houses, error: houseError } = await supabase.from('houses').select('id,house_number').eq('street_id', street.id);
    if (houseError) throw houseError;
    const house = houses?.find((item) => normalize(item.house_number) === normalize(entry.house));
    if (!house) { output.unresolved.push(`${entry.street}-${entry.house}: house missing`); continue; }
    const { data: assignments, error: assignmentsError } = await supabase
      .from('resident_houses')
      .select('id,resident_id,resident_role,is_active,residents!resident_houses_resident_id_fkey(id,first_name,last_name,notes)')
      .eq('house_id', house.id)
      .eq('is_active', true);
    if (assignmentsError) throw assignmentsError;
    const canonicalAssignment = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string } | null;
      return resident && normalize(displayName(resident)) === normalize(entry.canonical);
    });
    if (!canonicalAssignment) { output.unresolved.push(`${entry.street}-${entry.house}: canonical not active (${entry.canonical})`); continue; }
    const canonicalResident = canonicalAssignment.residents as unknown as { id: string; first_name: string; last_name: string };

    for (const aliasName of entry.aliases) {
      const existingAssignment = assignments?.find((assignment) => {
        const resident = assignment.residents as unknown as { first_name: string; last_name: string } | null;
        return resident && normalize(displayName(resident)) === normalize(aliasName);
      });
      output.applied.push(`${entry.street}-${entry.house}: ${aliasName} -> ${displayName(canonicalResident)}`);
      if (!apply) continue;
      const { data: existingAlias, error: aliasLookupError } = await supabase
        .from('resident_payment_aliases').select('id')
        .eq('resident_id', canonicalResident.id).eq('alias_name', aliasName).maybeSingle();
      if (aliasLookupError) throw aliasLookupError;
      if (!existingAlias) {
        const { error } = await supabase.from('resident_payment_aliases').insert({
          resident_id: canonicalResident.id,
          alias_name: aliasName,
          is_active: true,
          notes: 'Legacy tracker import 2026-08-11; user-confirmed payment alias.',
        });
        if (error) throw error;
      }
      if (existingAssignment) {
        const oldResident = existingAssignment.residents as unknown as { id: string; notes: string | null };
        const note = `Legacy import 2026-08-11: preserved record; confirmed payment alias for ${displayName(canonicalResident)}. House assignment deactivated; use resident_payment_aliases for matching.`;
        const { error: deactivateError } = await supabase.from('resident_houses')
          .update({ is_active: false, move_out_date: '2026-08-11' }).eq('id', existingAssignment.id);
        if (deactivateError) throw deactivateError;
        const { error: noteError } = await supabase.from('residents')
          .update({ notes: oldResident.notes?.trim() ? `${oldResident.notes.trim()}\n\n${note}` : note }).eq('id', oldResident.id);
        if (noteError) throw noteError;
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...output }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
