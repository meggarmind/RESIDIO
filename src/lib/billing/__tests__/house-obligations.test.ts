import { describe, expect, it } from 'vitest';
import { buildHouseObligations } from '@/lib/billing/house-obligations';

const categories = [
  { code: 'dues', name: 'Dues' },
  { code: 'development_levy', name: 'Development Levy' },
];
const names = new Map([
  ['tenant', 'Tobi Tenant'],
  ['landlord', 'Lola Landlord'],
]);
const parties = [
  { id: 'tenant', role: 'tenant' },
  { id: 'landlord', role: 'non_resident_landlord' },
];
const house = { vacant: false, newNeverOccupied: false };

describe('buildHouseObligations (#1196)', () => {
  it('shows both parties of a house: the tenant owing dues and the landlord owing a levy', () => {
    const { groups } = buildHouseObligations({
      house,
      parties,
      names,
      categories,
      invoices: [
        { resident_id: 'tenant', charge_category: 'dues', amount_due: 50_000, amount_paid: 20_000, payer: 'occupant' },
        { resident_id: 'landlord', charge_category: 'development_levy', amount_due: 300_000, amount_paid: 0, payer: 'landlord' },
      ],
      payments: [],
    });

    const [occupant, landlord] = groups;
    expect(occupant.label).toBe('Occupant dues');
    expect(occupant.parties).toMatchObject([{ id: 'tenant', name: 'Tobi Tenant', current: true, billed: 50_000, paid: 20_000, outstanding: 30_000 }]);
    expect(landlord.label).toBe('Landlord levies');
    expect(landlord.parties).toMatchObject([{ id: 'landlord', current: true, outstanding: 300_000 }]);
    expect(landlord.parties[0].byCategory).toEqual([{ code: 'development_levy', name: 'Development Levy', billed: 300_000, paid: 0, outstanding: 300_000 }]);
  });

  it('lists the current party of each class before any invoice, and a former payer after them', () => {
    const { groups } = buildHouseObligations({
      house,
      parties,
      names: new Map([...names, ['former', 'Fola Former']]),
      categories,
      invoices: [{ resident_id: 'former', charge_category: null, amount_due: 10_000, amount_paid: 0, payer: null }],
      payments: [],
    });
    // A legacy invoice (no profile) is an occupant charge in Dues.
    expect(groups[0].parties.map((p) => [p.id, p.current])).toEqual([['tenant', true], ['former', false]]);
    expect(groups[0].parties[1].byCategory[0].code).toBe('dues');
    expect(groups[1].parties.map((p) => p.id)).toEqual(['landlord']);
    expect(groups[1].billed).toBe(0);
  });

  it('never counts an overpaid invoice as negative outstanding', () => {
    const { groups } = buildHouseObligations({
      house,
      parties,
      names,
      categories,
      invoices: [{ resident_id: 'tenant', charge_category: 'dues', amount_due: 100, amount_paid: 150, payer: 'occupant' }],
      payments: [],
    });
    expect(groups[0].outstanding).toBe(0);
  });

  it('says who paid: the landlord paying a tenant credit is told apart from the tenant paying', () => {
    const { payments } = buildHouseObligations({
      house,
      parties,
      names,
      categories,
      invoices: [],
      payments: [
        { resident_id: 'tenant', amount: 50_000, payment_date: '2026-10-05', paid_by_resident_id: 'landlord', paid_by_name: null },
        { resident_id: 'tenant', amount: 25_000, payment_date: '2026-10-20', paid_by_resident_id: 'landlord', paid_by_name: null },
        { resident_id: 'tenant', amount: 10_000, payment_date: '2026-09-01', paid_by_resident_id: 'tenant', paid_by_name: null },
        { resident_id: 'tenant', amount: 5_000, payment_date: '2026-08-01', paid_by_resident_id: null, paid_by_name: 'Bank sender X' },
      ],
    });
    expect(payments).toEqual([
      { creditedToId: 'tenant', creditedToName: 'Tobi Tenant', paidByName: 'Lola Landlord', amount: 75_000, count: 2, lastDate: '2026-10-20' },
      { creditedToId: 'tenant', creditedToName: 'Tobi Tenant', paidByName: null, amount: 10_000, count: 1, lastDate: '2026-09-01' },
      { creditedToId: 'tenant', creditedToName: 'Tobi Tenant', paidByName: 'Bank sender X', amount: 5_000, count: 1, lastDate: '2026-08-01' },
    ]);
  });

  it('has no occupant party for a vacant house that bills nobody', () => {
    const { groups } = buildHouseObligations({
      house: { vacant: true, newNeverOccupied: true },
      parties: [{ id: 'landlord', role: 'non_resident_landlord' }],
      names,
      categories,
      invoices: [],
      payments: [],
    });
    expect(groups[0].parties).toEqual([]);
    expect(groups[1].parties.map((p) => p.id)).toEqual(['landlord']);
  });
});
