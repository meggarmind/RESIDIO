import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1067: an active co-resident is sponsored by the house's active Owner-Occupier or Renter. The
 * actions resolve and check the sponsor before the database trigger would reject the row.
 * Queries run against in-memory tables; eq/in filters are applied for real.
 */
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  lookupError: null as { message: string } | null,
  seq: 0,
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => ({ authorized: true, userId: 'user-1', permissions: [], error: null })),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/email/send-welcome-email', () => ({ sendWelcomeEmail: vi.fn(async () => undefined) }));
vi.mock('@/actions/verification/send-verification', () => ({
  sendEmailVerification: vi.fn(async () => undefined),
  sendPhoneVerification: vi.fn(async () => undefined),
}));
vi.mock('@/lib/residents/find-duplicates', () => ({ loadDuplicateMatches: vi.fn(async () => ({ matches: [], error: null })) }));

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      const rows = (h.tables[table] ??= []);
      const filters: ((r: Row) => boolean)[] = [];
      let op = 'select';
      let payload: Row = {};
      const run = () => {
        if (op === 'insert') {
          const added = { id: `${table}-${++h.seq}`, is_active: true, ...payload };
          rows.push(added);
          return { data: [added], error: null };
        }
        if (op === 'select' && table === 'resident_houses' && h.lookupError) return { data: null, error: h.lookupError };
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'delete') h.tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      };
      const chain: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'insert' || prop === 'delete') return (arg?: Row) => ((op = prop), (payload = arg ?? {}), chain);
          if (prop === 'eq') return (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
          if (prop === 'in') return (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain);
          if (prop === 'single')
            return async () => {
              const { data, error } = run();
              return data?.[0] ? { data: data[0], error: null } : { data: null, error: error ?? { message: 'none' } };
            };
          if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res);
          return () => chain; // select, limit, order: no effect here
        },
      });
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => makeClient(),
  createAdminClient: () => makeClient(),
}));

import { resolveSponsor } from '@/actions/residents/validation';
import { createResident } from '@/actions/residents/create-resident';
import { addHouseholdMember } from '@/actions/residents/add-household-member';
import type { SupabaseClient } from '@supabase/supabase-js';

const HOUSE = '11111111-1111-4111-8111-111111111111';
const OTHER_HOUSE = '22222222-2222-4222-8222-222222222222';

const rh = (resident_id: string, house_id: string, resident_role: string, is_active = true): Row => ({
  id: `rh-${resident_id}-${house_id}`,
  resident_id,
  house_id,
  resident_role,
  is_active,
});

beforeEach(() => {
  h.seq = 0;
  h.lookupError = null;
  h.tables = { resident_houses: [], residents: [], profiles: [] };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const client = () => makeClient() as unknown as SupabaseClient;

describe('resolveSponsor (#1067)', () => {
  it.each(['tenant', 'resident_landlord'])('defaults a co-resident to the house %s', async (role) => {
    h.tables.resident_houses.push(rh('owner', HOUSE, 'non_resident_landlord'), rh('resident', HOUSE, role));

    expect(await resolveSponsor(client(), HOUSE, 'co_resident')).toEqual({ sponsorId: 'resident' });
  });

  it('accepts the given sponsor when it is the house resident', async () => {
    h.tables.resident_houses.push(rh('resident', HOUSE, 'tenant'));

    expect(await resolveSponsor(client(), HOUSE, 'co_resident', 'resident')).toEqual({ sponsorId: 'resident' });
  });

  it('rejects a Property Owner as sponsor of a co-resident', async () => {
    h.tables.resident_houses.push(rh('owner', HOUSE, 'non_resident_landlord'), rh('resident', HOUSE, 'tenant'));

    const result = await resolveSponsor(client(), HOUSE, 'co_resident', 'owner');

    expect(result.sponsorId).toBeNull();
    expect(result.error).toBe('The sponsor for Occupant must be the Owner-Occupier or Renter of the same house.');
  });

  it.each([
    ['an inactive resident', [rh('resident', HOUSE, 'tenant', false)]],
    ['the resident of another house', [rh('resident', OTHER_HOUSE, 'tenant')]],
  ])('rejects %s as sponsor', async (_label, rows) => {
    h.tables.resident_houses.push(...rows);

    expect((await resolveSponsor(client(), HOUSE, 'co_resident', 'resident')).error).toMatch(/Owner-Occupier or Renter of the same house/);
  });

  it('refuses a co-resident in a house with no Owner-Occupier or Renter', async () => {
    h.tables.resident_houses.push(rh('owner', HOUSE, 'non_resident_landlord'));

    expect(await resolveSponsor(client(), HOUSE, 'co_resident')).toEqual({
      sponsorId: null,
      error: 'Occupant must be sponsored by the Owner-Occupier or Renter of the house, and this house has none.',
    });
  });

  it('keeps the staff rule: a Property Owner may sponsor domestic staff, a missing sponsor is refused', async () => {
    h.tables.resident_houses.push(rh('owner', HOUSE, 'non_resident_landlord'));

    expect(await resolveSponsor(client(), HOUSE, 'domestic_staff', 'owner')).toEqual({ sponsorId: 'owner' });
    expect((await resolveSponsor(client(), HOUSE, 'domestic_staff')).error).toMatch(/must have a sponsor/);
  });

  it('passes a role without a sponsor rule through unchecked', async () => {
    expect(await resolveSponsor(client(), HOUSE, 'household_member', 'anyone')).toEqual({ sponsorId: 'anyone' });
    expect(await resolveSponsor(client(), HOUSE, 'tenant')).toEqual({ sponsorId: null });
  });

  it('fails closed when the lookup errors', async () => {
    h.lookupError = { message: 'db down' };

    expect(await resolveSponsor(client(), HOUSE, 'co_resident')).toEqual({ sponsorId: null, error: 'Could not check the sponsor: db down' });
  });
});

describe('createResident with a co-resident role (#1067)', () => {
  const FORM = {
    first_name: 'Ngozi',
    last_name: 'Eze',
    email: '',
    phone_primary: '08030002222',
    resident_type: 'secondary' as const,
    house_id: HOUSE,
    resident_role: 'co_resident' as const,
  };

  it("sponsors the new co-resident with the house's Renter", async () => {
    h.tables.resident_houses.push(rh('resident', HOUSE, 'tenant'));

    const result = await createResident(FORM);

    expect(result.error).toBeNull();
    const row = h.tables.resident_houses.find((r) => r.resident_role === 'co_resident');
    expect(row).toMatchObject({ house_id: HOUSE, sponsor_resident_id: 'resident' });
  });

  it('creates nothing when the house has no Owner-Occupier or Renter', async () => {
    h.tables.resident_houses.push(rh('owner', HOUSE, 'non_resident_landlord'));

    const result = await createResident(FORM);

    expect(result.error).toMatch(/has none/);
    expect(h.tables.residents).toHaveLength(0);
    expect(h.tables.resident_houses.some((r) => r.resident_role === 'co_resident')).toBe(false);
  });
});

describe('addHouseholdMember with a co-resident role (#1067)', () => {
  it('makes the calling occupier the sponsor', async () => {
    h.tables.profiles.push({ id: 'user-1', resident_id: 'caller' });
    h.tables.resident_houses.push({ ...rh('caller', HOUSE, 'tenant'), is_primary: true });

    const result = await addHouseholdMember({ first_name: 'Ike', last_name: 'Eze', resident_role: 'co_resident', house_id: HOUSE });

    expect(result.error).toBeNull();
    const row = h.tables.resident_houses.find((r) => r.resident_role === 'co_resident');
    expect(row).toMatchObject({ house_id: HOUSE, sponsor_resident_id: 'caller' });
  });
});
