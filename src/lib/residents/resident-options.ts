import type { createAdminClient } from '@/lib/supabase/server';

/** A resident as a picker shows it: name plus a non-contact disambiguator, never phone or email. */
export type ResidentOption = { id: string; name: string; detail: string };

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  resident_code: string | null;
  resident_houses: Array<{ is_active: boolean; house: { house_number: string | null; street: { name: string | null } | null } | null }> | null;
};

/**
 * Picker source shared by the WhatsApp pilot list (#801) and recipient groups (#819). Returns
 * only the id, the name and the resident code plus active house. Includes inactive residents so
 * already-saved IDs still render by name. The caller checks permission first.
 */
export async function fetchResidentOptions(
  client: ReturnType<typeof createAdminClient>
): Promise<{ data: ResidentOption[]; error: string | null }> {
  const { data, error } = await client
    .from('residents')
    .select('id, first_name, last_name, resident_code, resident_houses!resident_id(is_active, house:houses(house_number, street:streets(name)))')
    .order('first_name')
    .order('last_name')
    // shortcut: capped at 1000 residents, so saved IDs past the cap show as Unknown; page or fetch saved IDs by .in('id') when an estate nears 1000.
    .limit(1000);
  if (error) return { data: [], error: error.message };
  return {
    data: ((data || []) as unknown as Row[]).map((row) => {
      const house = row.resident_houses?.find((link) => link.is_active)?.house;
      const address = house ? [house.house_number, house.street?.name].filter(Boolean).join(' ') : '';
      return {
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed resident',
        detail: [row.resident_code, address].filter(Boolean).join(' · '),
      };
    }),
    error: null,
  };
}
