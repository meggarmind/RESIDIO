import { describe, expect, it } from 'vitest';
import { resolvePayer } from '@/lib/billing/payer';

const r = (id: string, role: string) => ({ id, role });
const occupied = { vacant: false, newNeverOccupied: false };

describe('resolvePayer (#1068)', () => {
  it('occupant: tenant before resident landlord, never a non-resident landlord or developer', () => {
    expect(resolvePayer({ payer: 'occupant', house: occupied, applicableRoles: null, residents: [r('l', 'resident_landlord'), r('t', 'tenant')] }).payer?.id).toBe('t');
    expect(resolvePayer({ payer: 'occupant', house: occupied, applicableRoles: null, residents: [r('n', 'non_resident_landlord'), r('d', 'developer')] }))
      .toEqual({ payer: null, reason: 'No billable resident found' });
  });

  it('occupant: vacant house bills the non-resident landlord, unless new and never occupied', () => {
    const residents = [r('n', 'non_resident_landlord')];
    expect(resolvePayer({ payer: 'occupant', house: { vacant: true, newNeverOccupied: false }, applicableRoles: null, residents }).payer?.id).toBe('n');
    expect(resolvePayer({ payer: 'occupant', house: { vacant: true, newNeverOccupied: true }, applicableRoles: null, residents }))
      .toEqual({ payer: null, reason: 'New house, never occupied' });
  });

  it('landlord: resident landlord, else non-resident landlord, else developer, never a tenant', () => {
    const pick = (residents: ReturnType<typeof r>[]) => resolvePayer({ payer: 'landlord', house: occupied, applicableRoles: null, residents }).payer?.id;
    expect(pick([r('t', 'tenant'), r('n', 'non_resident_landlord'), r('l', 'resident_landlord')])).toBe('l');
    expect(pick([r('t', 'tenant'), r('d', 'developer'), r('n', 'non_resident_landlord')])).toBe('n');
    expect(pick([r('t', 'tenant'), r('d', 'developer')])).toBe('d');
  });

  it('landlord: no landlord on record is its own reason', () => {
    expect(resolvePayer({ payer: 'landlord', house: occupied, applicableRoles: null, residents: [r('t', 'tenant')] }))
      .toEqual({ payer: null, reason: 'No landlord on record' });
  });

  it('applicableRoles narrows the class and cannot add a tenant to a landlord profile', () => {
    const residents = [r('t', 'tenant'), r('l', 'resident_landlord'), r('n', 'non_resident_landlord')];
    expect(resolvePayer({ payer: 'landlord', house: occupied, applicableRoles: ['non_resident_landlord'], residents }).payer?.id).toBe('n');
    expect(resolvePayer({ payer: 'landlord', house: occupied, applicableRoles: ['tenant'], residents }))
      .toEqual({ payer: null, reason: 'Resident role is not applicable' });
  });
});

describe('billingProfileSchema payer (#1068)', () => {
  const base = { name: 'Dev Fee', items: [] };
  it('defaults the payer to occupant and rejects a tenant on a landlord profile', async () => {
    const { billingProfileSchema } = await import('@/lib/validators/billing');
    expect(billingProfileSchema.parse(base).payer).toBe('occupant');
    expect(billingProfileSchema.safeParse({ ...base, payer: 'landlord', applicable_roles: ['tenant'] }).success).toBe(false);
    expect(billingProfileSchema.safeParse({ ...base, payer: 'landlord', applicable_roles: ['developer'] }).success).toBe(true);
  });
});
