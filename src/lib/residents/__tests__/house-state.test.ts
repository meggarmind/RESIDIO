import { describe, expect, it } from 'vitest';
import { allowedResidentTypes, deriveHouseState } from '@/lib/residents/house-state';

describe('deriveHouseState', () => {
  it.each([
    [[], 'empty'],
    [['developer'], 'empty'],
    [['non_resident_landlord'], 'has_non_resident_landlord'],
    [['non_resident_landlord', 'tenant'], 'has_tenant'],
    [['tenant', 'co_resident'], 'has_tenant'],
    [['resident_landlord', 'co_resident'], 'has_resident_landlord'],
  ])('%j -> %s', (roles, state) => {
    expect(deriveHouseState(roles)).toBe(state);
  });
});

describe('allowedResidentTypes', () => {
  it('allows only secondary on a tenanted or owner-occupied house', () => {
    expect(allowedResidentTypes('has_tenant')).toEqual(['secondary']);
    expect(allowedResidentTypes('has_resident_landlord')).toEqual(['secondary']);
  });

  it('allows both types otherwise', () => {
    expect(allowedResidentTypes('empty')).toEqual(['primary', 'secondary']);
    expect(allowedResidentTypes('has_non_resident_landlord')).toEqual(['primary', 'secondary']);
  });
});
