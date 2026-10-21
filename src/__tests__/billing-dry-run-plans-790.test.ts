import { describe, expect, it } from 'vitest';
import { calculateLateFee, planLateFees } from '@/lib/billing/apply-late-fees';
import { planRetroactiveLevies, type LevyPlanProfile } from '@/lib/billing/retroactive-levy-plan';

// #790: the read-only previews behind "Apply Late Fees Now" and "Generate Retroactive
// Levies" must count what the real run would charge, using its skip rules.

describe('planLateFees', () => {
  const invoices = [
    { id: 'a', amount_due: 10000, invoice_items: null },
    { id: 'b', amount_due: 20000, invoice_items: [{ amount: 1000, late_fee_applied_at: '2026-10-01T00:00:00Z' }] },
    { id: 'c', amount_due: 30000, invoice_items: [{ amount: 30000, late_fee_applied_at: null }] },
    { id: 'd', amount_due: 5000, invoice_items: [] },
  ];

  it('charges percentage fees on eligible invoices and skips applied and waived ones', () => {
    expect(planLateFees(invoices, new Set(['c']), 'percentage', 5)).toEqual({
      eligible: 2,
      totalLateFees: 750,
      skippedWaiver: 1,
      skippedAlreadyApplied: 1,
    });
  });

  it('charges a fixed fee per eligible invoice', () => {
    expect(planLateFees(invoices, new Set(), 'fixed', 2500).totalLateFees).toBe(7500);
  });

  it('rounds percentage fees as the run does', () => {
    expect(calculateLateFee(333.33, 'percentage', 5)).toBe(16.67);
  });

  it('does not treat an admin line typed as the reserved late-fee description as a charged fee (#830)', () => {
    const adjusted = [
      { id: 'e', amount_due: 10000, invoice_items: [{ description: 'Late Fee (auto)', amount: 200, late_fee_applied_at: null }] },
    ];
    expect(planLateFees(adjusted, new Set(), 'percentage', 5)).toEqual({
      eligible: 1,
      totalLateFees: 500,
      skippedWaiver: 0,
      skippedAlreadyApplied: 0,
    });
  });
});

describe('planRetroactiveLevies', () => {
  const devLevy: LevyPlanProfile = {
    id: 'dev', name: 'Development Levy', target_type: 'house', applicable_roles: null,
    is_development_levy: true, billing_items: [{ amount: 500000 }],
  };
  const landlordOnly: LevyPlanProfile = {
    id: 'gate', name: 'Gate Fee', target_type: 'resident', applicable_roles: ['resident_landlord'],
    is_development_levy: false, billing_items: [{ amount: 20000 }, { amount: 5000 }],
  };
  const free: LevyPlanProfile = {
    id: 'free', name: 'Free', target_type: 'house', applicable_roles: null,
    is_development_levy: false, billing_items: [{ amount: 0 }],
  };

  const base = {
    autoGenerateEnabled: true,
    houseIds: ['h1', 'h2', 'h3', 'h4'],
    residentLinks: [
      { house_id: 'h1', resident_role: 'resident_landlord' },
      { house_id: 'h2', resident_role: 'tenant' },
      // tenant sorts before resident_landlord in the enum, so the tenant is billed.
      { house_id: 'h3', resident_role: 'resident_landlord' },
      { house_id: 'h3', resident_role: 'tenant' },
      { house_id: 'h4', resident_role: 'co_resident' },
    ],
    profiles: [devLevy, landlordOnly, free],
    history: [] as { house_id: string; billing_profile_id: string }[],
  };

  it('counts houses, invoices and the naira total the run would create', () => {
    expect(planRetroactiveLevies(base)).toEqual({
      autoGenerateEnabled: true,
      housesChecked: 4,
      houses: 1,
      invoices: 2,
      totalAmount: 525000,
      alreadyCharged: 0,
    });
  });

  it('skips levies already charged, so a second run adds nothing for them', () => {
    const plan = planRetroactiveLevies({
      ...base,
      history: [{ house_id: 'h1', billing_profile_id: 'dev' }, { house_id: 'h1', billing_profile_id: 'gate' }],
    });
    expect(plan).toMatchObject({ houses: 0, invoices: 0, totalAmount: 0, alreadyCharged: 2 });
  });

  it('creates nothing while auto-generate levies is off', () => {
    expect(planRetroactiveLevies({ ...base, autoGenerateEnabled: false })).toMatchObject({
      autoGenerateEnabled: false, houses: 0, invoices: 0, totalAmount: 0,
    });
  });
});
