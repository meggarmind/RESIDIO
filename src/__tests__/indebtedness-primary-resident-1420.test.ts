import { describe, expect, it, vi } from 'vitest';

/** #1420: the Indebtedness Report names the person its Security Dues bill, not the first link. */

const mocks = vi.hoisted(() => ({ getDebtStatuses: vi.fn(), client: { current: null as unknown } }));

vi.mock('@/lib/billing/debt-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/debt-status')>()),
  getDebtStatuses: mocks.getDebtStatuses,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => mocks.client.current,
  createAdminClient: () => mocks.client.current,
}));

import { generateIndebtednessReport, pickIndebtednessPrimary } from '@/lib/reports/report-generator';
import { isAsOfReportType } from '@/components/reports/report-viewer';

const link = (id: string, role: string, moveIn = '2024-01-01', active = true) => ({
  resident_id: id,
  resident_role: role,
  is_active: active,
  move_in_date: moveIn,
  resident: { id, first_name: id, last_name: role.toUpperCase() },
});

function table(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'in', 'neq']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  return q;
}

describe('pickIndebtednessPrimary', () => {
  it('shows the tenant when the landlord was linked first', () => {
    const links = [link('landlord', 'non_resident_landlord'), link('tenant', 'tenant')];
    expect(pickIndebtednessPrimary(links, 'occupant')?.resident_id).toBe('tenant');
  });

  it('shows the owner-occupier before a non-resident landlord', () => {
    const links = [link('nrl', 'non_resident_landlord'), link('owner', 'resident_landlord')];
    expect(pickIndebtednessPrimary(links, 'occupant')?.resident_id).toBe('owner');
  });

  it('ignores household members and inactive tenants', () => {
    const links = [
      link('old', 'tenant', '2020-01-01', false),
      link('nrl', 'non_resident_landlord'),
      link('kid', 'co_resident'),
    ];
    expect(pickIndebtednessPrimary(links, 'occupant')?.resident_id).toBe('nrl');
  });

  it('keeps a house with only a developer', () => {
    expect(pickIndebtednessPrimary([link('dev', 'developer')], 'occupant')?.resident_id).toBe('dev');
  });

  it('shows the landlord on a landlord-pays dues profile, even with a tenant', () => {
    const links = [link('tenant', 'tenant'), link('nrl', 'non_resident_landlord')];
    expect(pickIndebtednessPrimary(links, 'landlord')?.resident_id).toBe('nrl');
  });

  it('still names the tenant on a landlord-pays profile with no landlord on record', () => {
    expect(pickIndebtednessPrimary([link('tenant', 'tenant')], 'landlord')?.resident_id).toBe('tenant');
  });

  it('takes the newest move-in when two tenants are active', () => {
    const links = [link('first', 'tenant', '2023-05-01'), link('newest', 'tenant', '2025-02-01')];
    expect(pickIndebtednessPrimary(links, 'occupant')?.resident_id).toBe('newest');
  });

  it('returns null when nobody can be named', () => {
    expect(pickIndebtednessPrimary([link('kid', 'co_resident')], 'occupant')).toBeNull();
  });
});

describe('isAsOfReportType', () => {
  it('prints "As of" for the Indebtedness Report and invoice aging only', () => {
    expect(isAsOfReportType('indebtedness_summary')).toBe(true);
    expect(isAsOfReportType('invoice_aging')).toBe(true);
    expect(isAsOfReportType('collection_report')).toBe(false);
  });
});

describe('generateIndebtednessReport primary resident', () => {
  it('names the tenant or the landlord by the house billing profile', async () => {
    const houses = [
      {
        id: 'h1',
        house_number: '12',
        billing_profile: { payer: 'occupant' },
        street: { id: 's', name: 'Main' },
        resident_houses: [link('ebeano', 'non_resident_landlord'), link('ukaka', 'tenant')],
      },
      {
        id: 'h2',
        house_number: '32',
        billing_profile: { payer: 'landlord' },
        street: { id: 's', name: 'Main' },
        resident_houses: [link('tenant2', 'tenant'), link('angel', 'non_resident_landlord')],
      },
      {
        id: 'h3',
        house_number: '40',
        billing_profile: null,
        street: { id: 's', name: 'Main' },
        resident_houses: [link('nrl3', 'non_resident_landlord'), link('tenant3', 'tenant')],
      },
    ];
    mocks.client.current = { from: (t: string) => table(t === 'houses' ? houses : []) };
    mocks.getDebtStatuses.mockResolvedValue([]);

    const out = await generateIndebtednessReport(mocks.client.current as never);
    expect(out.houses.map((h) => [h.houseNumber, h.primaryResidentId, h.primaryResidentName])).toEqual([
      ['12', 'ukaka', 'ukaka TENANT'],
      ['32', 'angel', 'angel NON_RESIDENT_LANDLORD'],
      ['40', 'tenant3', 'tenant3 TENANT'],
    ]);
  });
});
