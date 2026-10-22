/**
 * Issue #1067 -- swapping a co-resident with the house's resident re-points the other co-residents to
 * the new resident. If that re-point fails, the swap is undone and an error returned, so no active
 * co-resident is left sponsored by someone who is now only a co-resident.
 *
 * The action runs against an in-memory resident_houses table: eq/in filters and updates are applied
 * for real, so the assertions are on the rows the action leaves behind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { swapResidentRoles } from '@/actions/residents/swap-resident-roles';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  // Makes the step-3 sponsor re-point (an update filtered on sponsor_resident_id) fail.
  failRepoint: false,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true, userId: 'caller' })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function makeClient() {
  return {
    from: (table: string) => {
      const rows = (h.tables[table] ??= []);
      const filters: Filter[] = [];
      let op: 'select' | 'update' | 'insert' = 'select';
      let payload: Row = {};
      let repoint = false;

      const run = () => {
        if (op === 'insert') {
          rows.push(payload);
          return { data: [payload], error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          if (repoint && h.failRepoint) return { data: null, error: { message: 'repoint failed' } };
          hit.forEach((r) => Object.assign(r, payload));
        }
        return { data: hit, error: null };
      };

      const chain: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          switch (prop) {
            case 'insert':
            case 'update':
              return (arg: Row) => ((op = prop), (payload = arg), chain);
            case 'eq':
              return (col: string, v: unknown) => {
                if (op === 'update' && col === 'sponsor_resident_id') repoint = true;
                filters.push((r) => r[col] === v);
                return chain;
              };
            case 'in':
              return (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain);
            case 'single':
              return async () => {
                const { data } = run();
                const first = data?.[0];
                return first ? { data: first, error: null } : { data: null, error: { message: 'none' } };
              };
            case 'then':
              return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
            default:
              return () => chain;
          }
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

const HOUSE = 'house-1';
const rh = () => h.tables.resident_houses;
const row = (residentId: string) => rh().find((r) => r.resident_id === residentId)!;

beforeEach(() => {
  h.failRepoint = false;
  h.tables = {
    residents: [],
    house_ownership_history: [],
    resident_houses: [
      { id: 'rh-tenant', resident_id: 'tenant', house_id: HOUSE, resident_role: 'tenant', sponsor_resident_id: null, is_active: true },
      { id: 'rh-promote', resident_id: 'promote', house_id: HOUSE, resident_role: 'co_resident', sponsor_resident_id: 'tenant', is_active: true },
      { id: 'rh-other', resident_id: 'other', house_id: HOUSE, resident_role: 'co_resident', sponsor_resident_id: 'tenant', is_active: true },
    ],
  };
});

describe('swapResidentRoles keeps every co-resident sponsored by the resident (#1067)', () => {
  it('re-points the other co-residents to the promoted resident', async () => {
    expect(await swapResidentRoles(HOUSE, 'promote', 'tenant')).toEqual({ success: true, error: null });

    expect(row('promote')).toMatchObject({ resident_role: 'tenant', sponsor_resident_id: null });
    expect(row('tenant')).toMatchObject({ resident_role: 'co_resident', sponsor_resident_id: 'promote' });
    expect(row('other')).toMatchObject({ resident_role: 'co_resident', sponsor_resident_id: 'promote' });
  });

  it('fails and undoes the swap when the re-point fails', async () => {
    h.failRepoint = true;

    const result = await swapResidentRoles(HOUSE, 'promote', 'tenant');

    expect(result).toEqual({ success: false, error: 'Failed to update sponsors for other residents' });
    expect(row('tenant')).toMatchObject({ resident_role: 'tenant', sponsor_resident_id: null });
    expect(row('promote')).toMatchObject({ resident_role: 'co_resident', sponsor_resident_id: 'tenant' });
    expect(row('other')).toMatchObject({ resident_role: 'co_resident', sponsor_resident_id: 'tenant' });
  });
});
