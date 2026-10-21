import { createAdminClient } from '@/lib/supabase/server';
import {
  findMatches,
  type DuplicateCandidate,
  type DuplicateResidentMatch,
  type ExistingResidentRow,
} from './duplicate-match';

/**
 * Existing residents the candidate matches under the rule in duplicate-match.ts. Callers must
 * already be authorised: this reads with the admin client so RLS cannot hide a duplicate.
 * Reads the whole roster and matches in code (as WhatsApp identity does) because phones are
 * stored in mixed formats and must be compared normalised.
 */
export async function loadDuplicateMatches(
  candidate: DuplicateCandidate
): Promise<{ matches: DuplicateResidentMatch[]; error: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('residents')
    .select('id, resident_code, first_name, last_name, email, phone_primary, phone_secondary, company_name, account_status');

  if (error) {
    console.error('[loadDuplicateMatches] Failed to load residents:', error);
    return { matches: [], error: error.message };
  }

  const found = findMatches(candidate, (data ?? []) as ExistingResidentRow[]);
  if (found.length === 0) return { matches: [], error: null };

  const { data: links, error: linkError } = await supabase
    .from('resident_houses')
    .select('resident_id, house:houses(house_number)')
    .in('resident_id', found.map(({ row }) => row.id))
    .eq('is_active', true);

  if (linkError) {
    console.error('[loadDuplicateMatches] Failed to load house links:', linkError);
  }

  const housesByResident = new Map<string, string[]>();
  for (const link of links ?? []) {
    const house = link.house as unknown as { house_number: string } | null;
    if (!house) continue;
    housesByResident.set(link.resident_id, [...(housesByResident.get(link.resident_id) ?? []), house.house_number]);
  }

  return {
    matches: found.map(({ row, reasons }) => ({
      resident_id: row.id,
      resident_code: row.resident_code,
      name: row.company_name || `${row.first_name} ${row.last_name}`.trim(),
      account_status: row.account_status,
      reasons,
      houses: housesByResident.get(row.id) ?? [],
    })),
    error: null,
  };
}
