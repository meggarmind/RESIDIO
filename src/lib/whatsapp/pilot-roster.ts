import { RESIDENT_ROLE_LABELS, type ResidentRole } from '@/types/database';
import type { ResidentOption } from '@/lib/residents/resident-options';

export type PilotOptInState = 'opted_in' | 'opted_out' | 'deactivated' | 'none';

/** One resident as the pilot list shows it. The WhatsApp number is masked before it leaves the server. */
export type PilotRosterResident = {
  id: string;
  name: string;
  code: string;
  houses: Array<{ label: string; streetId: string | null; role: string }>;
  optIn: PilotOptInState;
  phone: string | null;
};

export type PilotRosterStreet = { id: string; name: string };

export type ResidentRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  resident_code: string | null;
  resident_houses: Array<{
    is_active: boolean;
    resident_role: string | null;
    house: { house_number: string | null; street_id: string | null; street: { name: string | null } | null } | null;
  }> | null;
};

export type OptInRow = {
  resident_id: string;
  phone_number: string;
  opted_in: boolean;
  deactivated_at?: string | null;
};

/** Same mask as the operations console: first 4 and last 3 digits. */
export function maskPhone(phone: string): string {
  return phone.length < 7 ? phone : `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

function optInState(row: OptInRow): PilotOptInState {
  if (row.deactivated_at) return 'deactivated';
  return row.opted_in ? 'opted_in' : 'opted_out';
}

/**
 * Joins residents to their active houses and WhatsApp consent. A resident with several consent
 * rows shows the live one (opted in, not deactivated) first; otherwise the first row given, so
 * the caller passes them newest first.
 */
export function buildPilotRoster(residents: ResidentRow[], optIns: OptInRow[]): PilotRosterResident[] {
  const consentByResident = new Map<string, OptInRow>();
  for (const row of optIns) {
    const current = consentByResident.get(row.resident_id);
    if (!current || (optInState(current) !== 'opted_in' && optInState(row) === 'opted_in')) {
      consentByResident.set(row.resident_id, row);
    }
  }
  return residents.map((row) => {
    const consent = consentByResident.get(row.id);
    return {
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed resident',
      code: row.resident_code || '',
      houses: (row.resident_houses || [])
        .filter((link) => link.is_active && link.house)
        .map((link) => ({
          label: [link.house?.house_number, link.house?.street?.name].filter(Boolean).join(' '),
          streetId: link.house?.street_id ?? null,
          role: RESIDENT_ROLE_LABELS[link.resident_role as ResidentRole] ?? link.resident_role ?? '',
        })),
      optIn: consent ? optInState(consent) : 'none',
      phone: consent ? maskPhone(consent.phone_number) : null,
    };
  });
}

/** Picker options from the roster: name plus code and first active house, never contact data. */
export function rosterToOptions(roster: PilotRosterResident[]): ResidentOption[] {
  return roster.map((resident) => ({
    id: resident.id,
    name: resident.name,
    detail: [resident.code, resident.houses[0]?.label].filter(Boolean).join(' · '),
  }));
}

/** A pilot member and why the bot answers them: chosen by name, a house on the pilot street, or both. */
export type PilotMember = { id: string; resident: PilotRosterResident | null; byName: boolean; byStreet: boolean };

/**
 * Everyone the pilot gate (isWhatsAppRecipientAllowed) lets through: the chosen IDs plus residents
 * with an active house on the pilot street. A chosen ID with no roster entry stays, as unknown.
 */
export function pilotMembers(roster: PilotRosterResident[], residentIds: string[], streetId: string): PilotMember[] {
  const byId = new Map(roster.map((resident) => [resident.id, resident]));
  const chosen = new Set(residentIds);
  const members: PilotMember[] = residentIds.map((id) => {
    const resident = byId.get(id) ?? null;
    return { id, resident, byName: true, byStreet: !!streetId && !!resident?.houses.some((house) => house.streetId === streetId) };
  });
  if (streetId) {
    for (const resident of roster) {
      if (!chosen.has(resident.id) && resident.houses.some((house) => house.streetId === streetId)) {
        members.push({ id: resident.id, resident, byName: false, byStreet: true });
      }
    }
  }
  return members;
}
