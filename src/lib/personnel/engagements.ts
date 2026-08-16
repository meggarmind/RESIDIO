import type { PersonnelEngagementWithAccountability } from '@/types/database';

export type PersonnelAccountabilityFilter = 'all' | 'estate' | 'resident_house' | 'unassigned';

export interface PersonnelAccountabilitySummary {
  label: string;
  scope: 'estate' | 'resident_house' | 'unassigned';
  additionalCount: number;
}

export function getPersonnelAccountability(
  engagements: PersonnelEngagementWithAccountability[],
  today = new Date().toISOString().slice(0, 10)
): PersonnelAccountabilitySummary {
  const activeEngagements = engagements.filter(
    (engagement) =>
      engagement.start_date <= today &&
      (engagement.end_date === null || engagement.end_date >= today)
  );
  const estateEngagements = activeEngagements.filter(
    (engagement) => engagement.accountability_scope === 'estate'
  );
  const residentHouseEngagements = activeEngagements.filter(
    (engagement) => engagement.accountability_scope === 'resident_house'
  );

  if (estateEngagements.length > 0) {
    return {
      label: 'Estate' + (estateEngagements.length > 1 ? ` +${estateEngagements.length - 1}` : ''),
      scope: 'estate',
      additionalCount: estateEngagements.length - 1,
    };
  }

  if (residentHouseEngagements.length > 0) {
    const first = residentHouseEngagements[0].resident_house;
    const label = first
      ? `${first.house_number}${first.street_name ? `, ${first.street_name}` : ''} · ${first.resident_name}`
      : 'Resident House';
    return {
      label: label + (residentHouseEngagements.length > 1 ? ` +${residentHouseEngagements.length - 1}` : ''),
      scope: 'resident_house',
      additionalCount: residentHouseEngagements.length - 1,
    };
  }

  return { label: 'Unassigned', scope: 'unassigned', additionalCount: 0 };
}

export function matchesPersonnelAccountabilityFilter(
  engagements: PersonnelEngagementWithAccountability[],
  filter: PersonnelAccountabilityFilter,
  today?: string
) {
  if (filter === 'all') return true;

  return getPersonnelAccountability(engagements, today).scope === filter;
}
