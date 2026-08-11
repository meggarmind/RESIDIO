/**
 * Converts a vetted subset of legacy alias-only resident records into proper
 * payment aliases. Defaults to dry-run; pass --apply to write.
 *
 * The original resident rows are preserved. Their incorrectly-created house
 * assignments are deactivated and both records receive an import note.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD;
if (!url || !serviceRoleKey) throw new Error('Cloud Supabase configuration is unavailable.');

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const apply = process.argv.includes('--apply');

type AliasConversion = {
  street: string;
  house: string;
  canonicalName: string;
  aliasName: string;
};

// These are only user-confirmed alias-only relationships. Confirmed linked
// secondary residents and current landlords are intentionally excluded.
const conversions: AliasConversion[] = [
  { street: 'OJO.K', house: '2', canonicalName: 'EMEKA ABARA', aliasName: 'CHUKWUEMEKA FRANCIS' },
  { street: 'IBB', house: '18F-3', canonicalName: 'LANA ANIH', aliasName: 'PRINCE WOWO WEST' },
  { street: 'GLB', house: '5A', canonicalName: 'OKOLIE OZIOMA FRANCISCA', aliasName: 'OKOLI STEPHEN NDUBUEZE' },
  { street: 'GLB', house: '9A', canonicalName: 'MENE GODWIN TONSEJU', aliasName: 'MAMA SHOLA' },
  { street: 'KOA', house: '6', canonicalName: 'OYESANMI OMOLADE KEHINDE', aliasName: 'OMOKE HINDE PATRICK' },
];

const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const residentName = (resident: { first_name: string; last_name: string }) =>
  `${resident.first_name} ${resident.last_name}`.trim();

async function main() {
  const { data: streets, error: streetError } = await supabase
    .from('streets')
    .select('id,short_name')
    .in('short_name', [...new Set(conversions.map((item) => item.street))]);
  if (streetError) throw streetError;

  const results: string[] = [];
  for (const conversion of conversions) {
    const street = streets?.find((candidate) => candidate.short_name === conversion.street);
    if (!street) throw new Error(`Street not found: ${conversion.street}`);
    const { data: houses, error: houseError } = await supabase
      .from('houses')
      .select('id,house_number')
      .eq('street_id', street.id);
    if (houseError) throw houseError;
    const house = houses?.find((candidate) => normalise(candidate.house_number) === normalise(conversion.house));
    if (!house) throw new Error(`House not found: ${conversion.street}-${conversion.house}`);

    const { data: assignments, error: assignmentError } = await supabase
      .from('resident_houses')
      .select('id,resident_id,resident_role,is_active,residents!resident_houses_resident_id_fkey(id,first_name,last_name,notes)')
      .eq('house_id', house.id)
      .eq('is_active', true);
    if (assignmentError) throw assignmentError;

    const primary = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string } | null;
      return resident && normalise(residentName(resident)) === normalise(conversion.canonicalName);
    });
    const aliasAssignment = assignments?.find((assignment) => {
      const resident = assignment.residents as unknown as { first_name: string; last_name: string } | null;
      return resident && normalise(residentName(resident)) === normalise(conversion.aliasName);
    });
    if (!primary || !aliasAssignment) {
      throw new Error(`Expected canonical/alias assignment missing for ${conversion.street}-${conversion.house}`);
    }
    const primaryResident = primary.residents as unknown as { id: string; first_name: string; last_name: string; notes: string | null };
    const aliasResident = aliasAssignment.residents as unknown as { id: string; first_name: string; last_name: string; notes: string | null };

    const note = `Legacy import 2026-08-11: preserved record; confirmed payment alias for ${residentName(primaryResident)}. House assignment deactivated; use resident_payment_aliases for matching.`;
    results.push(`${conversion.street}-${conversion.house}: ${residentName(aliasResident)} -> ${residentName(primaryResident)}`);
    if (!apply) continue;

    const { data: existingAlias, error: existingAliasError } = await supabase
      .from('resident_payment_aliases')
      .select('id')
      .eq('resident_id', primaryResident.id)
      .eq('alias_name', residentName(aliasResident))
      .maybeSingle();
    if (existingAliasError) throw existingAliasError;
    if (!existingAlias) {
      const { error } = await supabase.from('resident_payment_aliases').insert({
        resident_id: primaryResident.id,
        alias_name: residentName(aliasResident),
        is_active: true,
        notes: 'Legacy tracker import 2026-08-11; converted from an alias-only resident record.',
      });
      if (error) throw error;
    }

    if (conversion.street === 'OJO.K' && conversion.house === '2') {
      for (const aliasName of ['Emeka Abara', 'Pastor']) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from('resident_payment_aliases')
          .select('id')
          .eq('resident_id', primaryResident.id)
          .eq('alias_name', aliasName)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (!duplicate) {
          const { error } = await supabase.from('resident_payment_aliases').insert({
            resident_id: primaryResident.id,
            alias_name: aliasName,
            is_active: true,
            notes: 'Legacy tracker import 2026-08-11; confirmed payment alias.',
          });
          if (error) throw error;
        }
      }
      const { error: residentNameError } = await supabase
        .from('residents')
        .update({ first_name: 'Chukwuemeka Francis', last_name: 'Abara' })
        .eq('id', primaryResident.id);
      if (residentNameError) throw residentNameError;
      const { error: roleError } = await supabase
        .from('resident_houses')
        .update({ resident_role: 'resident_landlord', is_primary: true })
        .eq('id', primary.id);
      if (roleError) throw roleError;
    }

    const { error: updateAssignmentError } = await supabase
      .from('resident_houses')
      .update({ is_active: false, move_out_date: '2026-08-11' })
      .eq('id', aliasAssignment.id);
    if (updateAssignmentError) throw updateAssignmentError;

    const existingNotes = aliasResident.notes?.trim();
    const { error: updateResidentError } = await supabase
      .from('residents')
      .update({ notes: existingNotes ? `${existingNotes}\n\n${note}` : note })
      .eq('id', aliasResident.id);
    if (updateResidentError) throw updateResidentError;
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', conversions: results }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
