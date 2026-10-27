import type { ResidentType } from '@/types/database';

export type HouseState = 'empty' | 'has_tenant' | 'has_resident_landlord' | 'has_non_resident_landlord';

/** Classifies a house from the roles of its active residents. */
export function deriveHouseState(activeRoles: readonly string[]): HouseState {
  if (activeRoles.includes('resident_landlord')) return 'has_resident_landlord';
  if (activeRoles.includes('tenant')) return 'has_tenant';
  if (activeRoles.includes('non_resident_landlord')) return 'has_non_resident_landlord';
  return 'empty';
}

const OCCUPIER_ROLES = ['tenant', 'resident_landlord'];

/** A tenanted or owner-occupied house already has its primary occupier; only secondary residents may take an occupier role. */
export function allowedResidentTypes(state: HouseState, role: string): ResidentType[] {
  const occupied = state === 'has_tenant' || state === 'has_resident_landlord';
  return occupied && OCCUPIER_ROLES.includes(role) ? ['secondary'] : ['primary', 'secondary'];
}
