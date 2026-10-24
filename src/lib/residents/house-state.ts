import type { ResidentType } from '@/types/database';

export type HouseState = 'empty' | 'has_tenant' | 'has_resident_landlord' | 'has_non_resident_landlord';

/** Classifies a house from the roles of its active residents. */
export function deriveHouseState(activeRoles: readonly string[]): HouseState {
  if (activeRoles.includes('resident_landlord')) return 'has_resident_landlord';
  if (activeRoles.includes('tenant')) return 'has_tenant';
  if (activeRoles.includes('non_resident_landlord')) return 'has_non_resident_landlord';
  return 'empty';
}

/** A tenanted or owner-occupied house already has its primary resident; only secondary residents may be added. */
export function allowedResidentTypes(state: HouseState): ResidentType[] {
  return state === 'has_tenant' || state === 'has_resident_landlord' ? ['secondary'] : ['primary', 'secondary'];
}
