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

  const activeResidentHouseEngagement = {
    id: 'engagement-2',
    personnel_id: 'personnel-2',
    accountability_scope: 'resident_house' as const,
    resident_house_id: 'resident-house-1',
    responsibility: 'Driver',
    start_date: '2026-08-15',
    end_date: null,
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    resident_house: {
      id: 'resident-house-1',
      house_number: '12A',
      street_name: 'Main St',
      resident_name: 'Ada Okoro',
    },
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

  it('summarizes an active Resident-House engagement with its house and resident', () => {
    expect(getPersonnelAccountability([activeResidentHouseEngagement])).toEqual({
      label: '12A, Main St · Ada Okoro',
      scope: 'resident_house',
      additionalCount: 0,
    });
  });

  it('falls back to a generic label when the Resident-House detail is missing', () => {
    expect(getPersonnelAccountability([
      { ...activeResidentHouseEngagement, resident_house: null },
    ])).toEqual({
      label: 'Resident House',
      scope: 'resident_house',
      additionalCount: 0,
    });
  });

  it('counts additional concurrent Resident-House engagements', () => {
    expect(getPersonnelAccountability([
      activeResidentHouseEngagement,
      {
        ...activeResidentHouseEngagement,
        id: 'engagement-3',
        resident_house_id: 'resident-house-2',
        resident_house: {
          id: 'resident-house-2',
          house_number: '5',
          street_name: null,
          resident_name: 'Bisi Eze',
        },
      },
    ])).toEqual({
      label: '12A, Main St · Ada Okoro +1',
      scope: 'resident_house',
      additionalCount: 1,
    });
  });

  it('does not treat an ended Resident-House engagement as active', () => {
    expect(getPersonnelAccountability([
      { ...activeResidentHouseEngagement, end_date: '2026-08-10' },
    ], '2026-08-15')).toEqual({
      label: 'Unassigned',
      scope: 'unassigned',
      additionalCount: 0,
    });
  });

  it('prefers Estate accountability when both Estate and Resident-House are active', () => {
    expect(getPersonnelAccountability([
      activeEstateEngagement,
      activeResidentHouseEngagement,
    ])).toEqual({
      label: 'Estate',
      scope: 'estate',
      additionalCount: 0,
    });
  });

  it('filters Estate and Unassigned Personnel by active accountability', () => {
    expect(matchesPersonnelAccountabilityFilter([activeEstateEngagement], 'estate')).toBe(true);
    expect(matchesPersonnelAccountabilityFilter([activeEstateEngagement], 'unassigned')).toBe(false);
    expect(matchesPersonnelAccountabilityFilter([], 'unassigned')).toBe(true);
  });

  it('matches Resident-House Personnel for the resident_house filter', () => {
    expect(matchesPersonnelAccountabilityFilter([activeResidentHouseEngagement], 'resident_house')).toBe(true);
    expect(matchesPersonnelAccountabilityFilter([activeResidentHouseEngagement], 'estate')).toBe(false);
  });
});
