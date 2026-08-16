import { describe, expect, it } from 'vitest';
import {
  getPersonnelAccountability,
  matchesPersonnelAccountabilityFilter,
} from '@/lib/personnel/engagements';

describe('Personnel Engagement accountability', () => {
  const activeEstateEngagement = {
    id: 'engagement-1',
    personnel_id: 'personnel-1',
    accountability_scope: 'estate' as const,
    resident_house_id: null,
    responsibility: 'Gate supervisor',
    start_date: '2026-08-15',
    end_date: null,
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    resident_house: null,
  };

  it('summarizes an active Estate Engagement for the directory', () => {
    expect(getPersonnelAccountability([activeEstateEngagement])).toEqual({
      label: 'Estate',
      scope: 'estate',
      additionalCount: 0,
    });
  });

  it('marks Personnel with no active engagement as Unassigned', () => {
    expect(getPersonnelAccountability([])).toEqual({
      label: 'Unassigned',
      scope: 'unassigned',
      additionalCount: 0,
    });
  });

  it('does not treat a future-dated Estate Engagement as active', () => {
    expect(getPersonnelAccountability([
      { ...activeEstateEngagement, start_date: '2026-08-16' },
    ], '2026-08-15')).toEqual({
      label: 'Unassigned',
      scope: 'unassigned',
      additionalCount: 0,
    });
  });

  it('filters Estate and Unassigned Personnel by active accountability', () => {
    expect(matchesPersonnelAccountabilityFilter([activeEstateEngagement], 'estate')).toBe(true);
    expect(matchesPersonnelAccountabilityFilter([activeEstateEngagement], 'unassigned')).toBe(false);
    expect(matchesPersonnelAccountabilityFilter([], 'unassigned')).toBe(true);
  });
});
