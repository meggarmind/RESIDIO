import { recordAudit } from '@/lib/audit/recorder';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { insertWhatsAppCode } from '@/lib/whatsapp/link-codes';

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

/** Minutes a LINK code from a sponsor stays valid (#1072 decision 4). */
export const CO_RESIDENT_LINK_CODE_MINUTES = 60;

export interface CoResident {
  id: string;
  firstName: string;
  lastName: string;
}

/** The sponsor's active co-residents on one house, in a stable order so a number reads the same list twice. */
export async function getCoResidents(sponsorId: string, houseId: string): Promise<CoResident[]> {
  const { data, error } = await createAdminClient()
    .from('resident_houses')
    .select('resident:residents!resident_houses_resident_id_fkey(id, first_name, last_name)')
    .eq('house_id', houseId)
    .eq('sponsor_resident_id', sponsorId)
    .eq('resident_role', 'co_resident')
    .eq('is_active', true);
  if (error) throw error;
  return (data || [])
    .map((row) => (Array.isArray(row.resident) ? row.resident[0] : row.resident) as { id: string; first_name: string; last_name: string } | null)
    .filter((resident): resident is { id: string; first_name: string; last_name: string } => !!resident)
    .map((resident) => ({ id: resident.id, firstName: resident.first_name, lastName: resident.last_name }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id));
}

/**
 * True when any active co-resident of this sponsor on this house has a verified WhatsApp link (#1117): an
 * active opt-in with link_verified_at set, or whose number is on the co-resident's own record. This is how
 * findLinkedResidents reads a verified link; an unverified opt-in gets the community tier only.
 */
export async function hasLinkedCoResident(sponsorId: string, houseId: string): Promise<boolean> {
  const people = await getCoResidents(sponsorId, houseId);
  if (people.length === 0) return false;
  const supabase = createAdminClient();
  const ids = people.map((person) => person.id);
  const [optins, residents] = await Promise.all([
    supabase.from('whatsapp_optins').select('resident_id, phone_number, link_verified_at').in('resident_id', ids).is('deactivated_at', null),
    supabase.from('residents').select('id, phone_primary, phone_secondary').in('id', ids),
  ]);
  if (optins.error) throw optins.error;
  if (residents.error) throw residents.error;
  const rows = optins.data || [];
  if (rows.length === 0) return false;
  const roster = new Map((residents.data || []).map((row) => [row.id, [row.phone_primary, row.phone_secondary].filter(Boolean).map((phone) => normalizePhoneNumber(phone as string))]));
  return rows.some((row) => !!row.link_verified_at || (roster.get(row.resident_id) || []).includes(normalizePhoneNumber(row.phone_number)));
}

/**
 * Issues a LINK code for one of the sponsor's co-residents on this house (#1072): 6 digits, single use,
 * 60 minutes, and it cancels the co-resident's other live link codes. The sponsor is the audit actor.
 * Null when the person is not (or no longer) the sponsor's active co-resident there, or the insert failed.
 */
export async function createCoResidentLinkCode(input: {
  sponsorId: string;
  coResidentId: string;
  houseId: string;
}): Promise<{ code: string; expiresAt: string } | null> {
  const coResident = (await getCoResidents(input.sponsorId, input.houseId)).find((person) => person.id === input.coResidentId);
  if (!coResident) return null;

  const token = await insertWhatsAppCode(createAdminClient(), {
    residentId: coResident.id,
    purpose: 'link',
    ttlMinutes: CO_RESIDENT_LINK_CODE_MINUTES,
    createdBy: null,
    supersede: true,
    issuer: { residentId: input.sponsorId, houseId: input.houseId },
  });
  if (!token) return null;

  // Never the code itself: only its hash is stored.
  await recordAudit(
    {
      action: 'CREATE',
      entityType: 'whatsapp_link_tokens',
      entityId: token.id,
      entityDisplay: `WhatsApp link code for ${coResident.firstName} ${coResident.lastName}`,
      newValues: { resident_id: coResident.id, purpose: 'link', expires_at: token.expiresAt, issued_by_resident_id: input.sponsorId, house_id: input.houseId },
      description: 'WhatsApp link code created for a co-resident by their sponsor over WhatsApp',
    },
    { userId: null, residentId: input.sponsorId }
  );
  return { code: token.code, expiresAt: token.expiresAt };
}
