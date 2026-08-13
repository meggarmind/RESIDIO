import { describe, expect, it } from 'vitest';
import {
  resolveInvoiceGenerationEligibility,
  InvoiceGenerationRequestSchema,
  resolveBillableCandidates,
  resolveProfileVersion,
  selectPeriods,
  type GenerationProfile,
} from '@/lib/billing/invoice-generation';

const profile: GenerationProfile = {
  id: 'profile-1',
  name: 'Monthly service charge',
  targetType: 'house' as const,
  applicableRoles: ['tenant', 'resident_landlord'],
};

const version = {
  id: 'version-1',
  billingProfileId: profile.id,
  effectiveFrom: '2026-06-01',
  items: [{ id: 'item-1', name: 'Service charge', amount: 31_000, frequency: 'monthly' as const }],
};

describe('invoice generation period and rate selection', () => {
  it('selects exactly the requested month', () => {
    expect(selectPeriods({ mode: 'selected_month', targetMonth: '2026-08-01' }))
      .toEqual(['2026-08-01']);
  });

  it('selects an inclusive backfill range', () => {
    expect(selectPeriods({ mode: 'backfill', fromMonth: '2026-06-01', targetMonth: '2026-08-01' }))
      .toEqual(['2026-06-01', '2026-07-01', '2026-08-01']);
  });

  it('rejects non-month period inputs and defaults historical side effects off', () => {
    expect(() => InvoiceGenerationRequestSchema.parse({
      mode: 'selected_month', targetMonth: '2026-08-12', trigger: 'manual',
    })).toThrow('first day of a month');
    expect(InvoiceGenerationRequestSchema.parse({
      mode: 'backfill', fromMonth: '2026-06-01', targetMonth: '2026-08-01', trigger: 'manual',
    })).toMatchObject({ walletAllocation: false, sendEmails: false, assessLateFees: false });
  });

  it('uses the version effective on the first day of the period', () => {
    expect(resolveProfileVersion('2026-08-01', [
      { ...version, effectiveFrom: '2026-06-01' },
      { ...version, id: 'version-2', effectiveFrom: '2026-08-01' },
    ]).id).toBe('version-2');
  });

  it('rejects a version effective mid-month', () => {
    expect(() => resolveProfileVersion('2026-08-01', [{ ...version, effectiveFrom: '2026-07-15' }]))
      .toThrow('first day of a month');
  });

  it('fails a historical period that has no effective version', () => {
    expect(() => resolveProfileVersion('2026-05-01', [version]))
      .toThrow('No billing profile version');
  });

  it('selects the effective rate for each backfill period', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'backfill', fromMonth: '2026-06-01', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [profile],
      versions: [
        { ...version, id: 'june-rate', effectiveFrom: '2026-06-01' },
        { ...version, id: 'august-rate', effectiveFrom: '2026-08-01', items: [{ ...version.items[0], amount: 35_000 }] },
      ],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [{ id: 'resident-1', name: 'Ada', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true }],
      }],
    });

    expect(result.candidates.map(({ periodStart, billingProfileVersionId, amountDue }) => ({ periodStart, billingProfileVersionId, amountDue }))).toEqual([
      { periodStart: '2026-06-01', billingProfileVersionId: 'june-rate', amountDue: 31_000 },
      { periodStart: '2026-07-01', billingProfileVersionId: 'june-rate', amountDue: 31_000 },
      { periodStart: '2026-08-01', billingProfileVersionId: 'august-rate', amountDue: 35_000 },
    ]);
  });
});

describe('invoice generation eligibility settings', () => {
  it('normalizes the shared preview and execution defaults identically', () => {
    expect(resolveInvoiceGenerationEligibility({})).toEqual({
      billVacantHouses: false,
      billUnderRenovation: false,
      billUnderConstruction: false,
      dueWindowDays: 30,
    });
    expect(resolveInvoiceGenerationEligibility({
      billVacantHouses: true,
      billUnderRenovation: true,
      billUnderConstruction: true,
      dueWindowDays: '21',
    })).toEqual({
      billVacantHouses: true,
      billUnderRenovation: true,
      billUnderConstruction: true,
      dueWindowDays: 21,
    });
  });
});

describe('invoice generation candidates', () => {
  it('prorates the eligible resident move-in month', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [profile], versions: [version],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [{ id: 'resident-1', name: 'Ada', accountStatus: 'active', role: 'tenant', moveInDate: '2026-08-17', isActive: true }],
      }],
    });

    expect(result.candidates).toMatchObject([{
      residentId: 'resident-1', houseId: 'house-1', periodStart: '2026-08-01',
      amountDue: 15_000, isProRata: true,
    }]);
  });

  it('bills the priority resident once for a house profile', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [profile], versions: [version],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [
          { id: 'owner', name: 'Owner', accountStatus: 'active', role: 'resident_landlord', moveInDate: '2025-01-01', isActive: true },
          { id: 'tenant', name: 'Tenant', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true },
        ],
      }],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].residentId).toBe('tenant');
  });

  it('does not bill a non-resident owner for an occupied house', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [{ ...profile, applicableRoles: ['non_resident_landlord'] }], versions: [version],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [{ id: 'owner', name: 'Owner', accountStatus: 'active', role: 'non_resident_landlord', moveInDate: '2025-01-01', isActive: true }],
      }],
    });
    expect(result.candidates).toEqual([]);
    expect(result.skips).toMatchObject([{ reason: 'No billable resident found' }]);
  });

  it('creates one candidate per matching resident-house role for a resident profile', () => {
    const residentProfile = { ...profile, id: 'profile-2', targetType: 'resident' as const, applicableRoles: ['tenant'] };
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [residentProfile], versions: [{ ...version, billingProfileId: residentProfile.id }],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: residentProfile.id, propertyStatus: 'occupied', isActive: true,
        residents: [
          { id: 'tenant-1', name: 'Tenant one', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true },
          { id: 'tenant-2', name: 'Tenant two', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true },
          { id: 'member', name: 'Member', accountStatus: 'active', role: 'household_member', moveInDate: '2025-01-01', isActive: true },
        ],
      }],
    });
    expect(result.candidates.map((candidate) => candidate.residentId)).toEqual(['tenant-1', 'tenant-2']);
  });

  it('uses scope to narrow without bypassing eligibility and explains exclusions', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual', houseId: '00000000-0000-4000-8000-000000000001' },
      profiles: [profile], versions: [version],
      houses: [{
        id: '00000000-0000-4000-8000-000000000001', label: 'A1', billingProfileId: profile.id, propertyStatus: 'under_renovation', isActive: true,
        residents: [{ id: 'resident-1', name: 'Ada', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true }],
      }],
    });
    expect(result.candidates).toEqual([]);
    expect(result.skips).toMatchObject([{ houseId: '00000000-0000-4000-8000-000000000001', reason: 'Under renovation (billing disabled)' }]);
  });

  it('reports residents who moved in after the selected period', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [profile], versions: [version],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [{ id: 'resident-1', name: 'Ada', accountStatus: 'active', role: 'tenant', moveInDate: '2026-09-01', isActive: true }],
      }],
    });

    expect(result.candidates).toEqual([]);
    expect(result.skips).toMatchObject([{ house: 'A1', reason: 'Resident moved in after selected period' }]);
  });

  it('reports profiles whose effective version has no monthly items', () => {
    const result = resolveBillableCandidates({
      request: { mode: 'selected_month', targetMonth: '2026-08-01', trigger: 'manual' },
      profiles: [profile], versions: [{ ...version, items: [{ ...version.items[0], frequency: 'yearly' }] }],
      houses: [{
        id: 'house-1', label: 'A1', billingProfileId: profile.id, propertyStatus: 'occupied', isActive: true,
        residents: [{ id: 'resident-1', name: 'Ada', accountStatus: 'active', role: 'tenant', moveInDate: '2025-01-01', isActive: true }],
      }],
    });

    expect(result.candidates).toEqual([]);
    expect(result.skips).toMatchObject([{ house: 'A1', reason: 'No monthly billing items' }]);
  });
});
