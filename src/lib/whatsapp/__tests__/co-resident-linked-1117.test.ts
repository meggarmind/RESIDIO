import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1117: a sponsor is offered Link a co-resident until one of their co-residents on the house has linked
 * a WhatsApp number, by LINK code or by a number on that co-resident's own roster (#849).
 */
type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
    is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: (db.tables[table] ||= []).filter((row) => filters.every((f) => f(row))), error: null }).then(resolve),
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: (table: string) => query(table) }) }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn() }));

import { hasLinkedCoResident } from '@/lib/whatsapp/co-resident';

const SPONSOR = 'sponsor-1';
const HOUSE = 'house-1';

function seed(options: { optIn?: Row; resident?: Row; coResident?: boolean } = {}) {
  db.tables = {
    resident_houses:
      options.coResident === false
        ? []
        : [{ house_id: HOUSE, sponsor_resident_id: SPONSOR, resident_role: 'co_resident', is_active: true, resident: { id: 'co-1', first_name: 'Bola', last_name: 'Example' } }],
    residents: [{ id: 'co-1', phone_primary: '0803 000 0001', phone_secondary: null, ...options.resident }],
    whatsapp_optins: options.optIn ? [{ resident_id: 'co-1', phone_number: '+2348030000001', deactivated_at: null, link_verified_at: null, ...options.optIn }] : [],
  };
}

beforeEach(() => {
  db.tables = {};
});

describe('hasLinkedCoResident (#1117)', () => {
  it('is true for an opt-in verified by a LINK code, whatever the number', async () => {
    seed({ optIn: { phone_number: '+2348099999999', link_verified_at: '2026-10-20T10:00:00Z' } });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(true);
  });

  it('is true for an opt-in whose number is on the co-resident’s own roster', async () => {
    seed({ optIn: {} });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(true);
  });

  it('is true when the number matches the secondary roster phone', async () => {
    seed({ optIn: {}, resident: { phone_primary: null, phone_secondary: '08030000001' } });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(true);
  });

  it('is false for an unverified opt-in whose number is not on the roster', async () => {
    seed({ optIn: { phone_number: '+2348099999999' } });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(false);
  });

  it('is false for a deactivated opt-in, even a verified one', async () => {
    seed({ optIn: { link_verified_at: '2026-10-20T10:00:00Z', deactivated_at: '2026-10-21T10:00:00Z' } });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(false);
  });

  it('is false when the co-resident has no opt-in', async () => {
    seed();
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(false);
  });

  it('is false when the sponsor has no co-residents on the house', async () => {
    seed({ coResident: false, optIn: { link_verified_at: '2026-10-20T10:00:00Z' } });
    expect(await hasLinkedCoResident(SPONSOR, HOUSE)).toBe(false);
  });

  it('ignores a co-resident of another sponsor or house', async () => {
    seed({ optIn: { link_verified_at: '2026-10-20T10:00:00Z' } });
    expect(await hasLinkedCoResident('someone-else', HOUSE)).toBe(false);
    expect(await hasLinkedCoResident(SPONSOR, 'house-2')).toBe(false);
  });
});
