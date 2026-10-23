import { createAdminClient } from '@/lib/supabase/server';

/** Roles that can sponsor a co-resident (#1067); the sponsor's account is the one a co-resident sees (#1071). */
export const SPONSOR_ROLES = ['resident_landlord', 'tenant'];

export interface SponsoredHouse {
  houseId: string;
  sponsorId: string;
  house: unknown;
}

/**
 * The houses where this person is an active co-resident and the named sponsor still holds an active
 * resident_landlord or tenant row on the same house. A sponsor who moved out ends the link at once;
 * no other account is ever guessed (#1071 decision 1).
 */
export async function getSponsoredHouses(coResidentId: string): Promise<SponsoredHouse[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('resident_houses')
    .select('house_id, sponsor_resident_id, house:houses(house_number, short_name, street:streets(name))')
    .eq('resident_id', coResidentId)
    .eq('resident_role', 'co_resident')
    .eq('is_active', true)
    .not('sponsor_resident_id', 'is', null);
  if (error) throw error;
  const links = data || [];
  if (links.length === 0) return [];

  const { data: sponsorRows, error: sponsorError } = await supabase
    .from('resident_houses')
    .select('resident_id, house_id')
    .in('resident_id', [...new Set(links.map((link) => link.sponsor_resident_id as string))])
    .in('house_id', links.map((link) => link.house_id))
    .in('resident_role', SPONSOR_ROLES)
    .eq('is_active', true);
  if (sponsorError) throw sponsorError;
  const live = new Set((sponsorRows || []).map((row) => `${row.resident_id}|${row.house_id}`));
  return links
    .filter((link) => live.has(`${link.sponsor_resident_id}|${link.house_id}`))
    .map((link) => ({ houseId: link.house_id, sponsorId: link.sponsor_resident_id as string, house: link.house }));
}
