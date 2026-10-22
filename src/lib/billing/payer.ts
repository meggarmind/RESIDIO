/**
 * Who pays a billing profile (#1068). One function for recurring generation, levy
 * generation and the dry-run plans, so the three cannot disagree.
 *
 * - `occupant`: the tenant, else the resident landlord. A vacant house bills the
 *   non-resident landlord, unless it is flagged new and never occupied (then no invoice).
 * - `landlord`: resident landlord, else non-resident landlord, else developer. Never a tenant.
 *
 * `applicableRoles` may narrow the roles inside the class; it never adds a role to it.
 */

export type BillingPayer = 'occupant' | 'landlord';

export const OCCUPANT_PAYER_ROLES = ['tenant', 'resident_landlord'] as const;
export const LANDLORD_PAYER_ROLES = ['resident_landlord', 'non_resident_landlord', 'developer'] as const;

export interface PayerCandidate {
  id: string;
  role: string;
}

export type PayerResolution<T extends PayerCandidate> =
  | { payer: T; reason: null }
  | { payer: null; reason: string };

export function resolvePayer<T extends PayerCandidate>(input: {
  payer: BillingPayer;
  house: { vacant: boolean; newNeverOccupied: boolean };
  applicableRoles: readonly string[] | null;
  residents: T[];
}): PayerResolution<T> {
  const { payer, house, applicableRoles, residents } = input;

  let roles: readonly string[];
  if (payer === 'landlord') {
    roles = LANDLORD_PAYER_ROLES;
    if (!residents.some((resident) => (LANDLORD_PAYER_ROLES as readonly string[]).includes(resident.role))) {
      return { payer: null, reason: 'No landlord on record' };
    }
  } else if (house.vacant) {
    if (house.newNeverOccupied) return { payer: null, reason: 'New house, never occupied' };
    roles = [...OCCUPANT_PAYER_ROLES, 'non_resident_landlord'];
  } else {
    roles = OCCUPANT_PAYER_ROLES;
  }

  const allowed = applicableRoles ? roles.filter((role) => applicableRoles.includes(role)) : roles;
  for (const role of allowed) {
    const found = residents.find((resident) => resident.role === role);
    if (found) return { payer: found, reason: null };
  }
  return { payer: null, reason: applicableRoles ? 'Resident role is not applicable' : 'No billable resident found' };
}
