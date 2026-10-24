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
  it('allows only secondary for an occupier role on a tenanted or owner-occupied house', () => {
    expect(allowedResidentTypes('has_tenant', 'resident_landlord')).toEqual(['secondary']);
    expect(allowedResidentTypes('has_resident_landlord', 'tenant')).toEqual(['secondary']);
  });

  it('accepts a non-occupier role on a tenant-only house', () => {
    expect(allowedResidentTypes('has_tenant', 'non_resident_landlord')).toEqual(['primary', 'secondary']);
    expect(allowedResidentTypes('has_tenant', 'developer')).toEqual(['primary', 'secondary']);
  });

  it('allows both types on a house without an occupier', () => {
    expect(allowedResidentTypes('empty', 'tenant')).toEqual(['primary', 'secondary']);
    expect(allowedResidentTypes('has_non_resident_landlord', 'tenant')).toEqual(['primary', 'secondary']);
  });
});
