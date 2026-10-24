/**
 * House occupancy rule (owner decision 2026-10-24, #1148): a house is occupied only when it has an
 * active resident_houses link whose role actually lives there. Mirrors public.update_house_occupancy().
 */
export const RESIDING_ROLES = ['tenant', 'resident_landlord'] as const;

export function isResidingRole(role: string | null | undefined): boolean {
  return !!role && (RESIDING_ROLES as readonly string[]).includes(role);
}
