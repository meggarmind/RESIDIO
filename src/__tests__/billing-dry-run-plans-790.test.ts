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
    id: 'dev', name: 'Development Levy', payer: 'landlord', target_type: 'resident', applicable_roles: null,
    is_development_levy: true, charge_category: 'development_levy', billing_items: [{ amount: 500000 }],
  };
  const landlordOnly: LevyPlanProfile = {
    id: 'gate', name: 'Gate Fee', payer: 'landlord', target_type: 'resident', applicable_roles: ['resident_landlord'],
    is_development_levy: false, charge_category: 'transformer_fee', billing_items: [{ amount: 20000 }, { amount: 5000 }],
  };
  const free: LevyPlanProfile = {
    id: 'free', name: 'Free', payer: 'landlord', target_type: 'resident', applicable_roles: null,
    is_development_levy: false, charge_category: 'dues', billing_items: [{ amount: 0 }],
  };

  const house = (id: string, over = {}) => ({ id, label: id.toUpperCase(), vacant: false, newNeverOccupied: false, ...over });
  const base = {
    autoGenerateEnabled: true,
    houses: [house('h1'), house('h2'), house('h3'), house('h4')],
    residentLinks: [
      { house_id: 'h1', resident_id: 'a', resident_role: 'resident_landlord' },
      // h2 has only a tenant: no landlord, so nothing is raised and the admin is warned.
      { house_id: 'h2', resident_id: 'b', resident_role: 'tenant' },
      // h3: a levy goes to the landlord even though a tenant lives there.
      { house_id: 'h3', resident_id: 'c', resident_role: 'resident_landlord' },
      { house_id: 'h3', resident_id: 'd', resident_role: 'tenant' },
      { house_id: 'h4', resident_id: 'e', resident_role: 'co_resident' },
    ],
    profiles: [devLevy, landlordOnly, free],
    history: [] as { house_id: string; billing_profile_id: string }[],
  };

  it('counts houses, invoices and the naira total the run would create', () => {
    expect(planRetroactiveLevies(base)).toEqual({
      autoGenerateEnabled: true,
      housesChecked: 4,
      houses: 2,
      invoices: 4,
      totalAmount: 1050000,
      alreadyCharged: 0,
      byCategory: {
        development_levy: { invoices: 2, totalAmount: 1000000 },
        transformer_fee: { invoices: 2, totalAmount: 50000 },
      },
      warnings: [
        'House H2: no landlord on record, so "Development Levy" would not be raised',
        'House H2: no landlord on record, so "Gate Fee" would not be raised',
        'House H2: no landlord on record, so "Free" would not be raised',
        'House H4: no landlord on record, so "Development Levy" would not be raised',
        'House H4: no landlord on record, so "Gate Fee" would not be raised',
        'House H4: no landlord on record, so "Free" would not be raised',
      ],
    });
  });

  it('skips levies already charged, so a second run adds nothing for them', () => {
    const plan = planRetroactiveLevies({
      ...base,
      history: [
        { house_id: 'h1', billing_profile_id: 'dev' }, { house_id: 'h1', billing_profile_id: 'gate' },
        { house_id: 'h3', billing_profile_id: 'dev' }, { house_id: 'h3', billing_profile_id: 'gate' },
      ],
    });
    expect(plan).toMatchObject({ houses: 0, invoices: 0, totalAmount: 0, alreadyCharged: 4 });
  });

  it('creates nothing while auto-generate levies is off', () => {
    expect(planRetroactiveLevies({ ...base, autoGenerateEnabled: false })).toMatchObject({
      autoGenerateEnabled: false, houses: 0, invoices: 0, totalAmount: 0,
    });
  });

  it('raises each landlord-only category once per house, to the landlord and never the tenant (#1193)', () => {
    const plan = planRetroactiveLevies({
      ...base,
      houses: [house('h3')],
      profiles: [devLevy, landlordOnly],
      history: [{ house_id: 'h3', billing_profile_id: 'gate' }],
    });
    // h3 already has its transformer fee, so only the Development Levy is planned.
    expect(plan).toMatchObject({ invoices: 1, totalAmount: 500000, alreadyCharged: 1, byCategory: { development_levy: { invoices: 1, totalAmount: 500000 } } });
    expect(plan.byCategory.transformer_fee).toBeUndefined();
  });

  it('bills a landlord levy to a developer when no landlord is on record, and never to a tenant', () => {
    const plan = planRetroactiveLevies({
      ...base,
      houses: [house('h5')],
      residentLinks: [{ house_id: 'h5', resident_id: 'f', resident_role: 'developer' }, { house_id: 'h5', resident_id: 'g', resident_role: 'tenant' }],
      profiles: [devLevy],
    });
    expect(plan).toMatchObject({ houses: 1, invoices: 1, totalAmount: 500000, warnings: [] });
  });
});
