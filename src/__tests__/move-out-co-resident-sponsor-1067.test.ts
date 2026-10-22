/**
 * Issue #1067 -- every active co-resident is sponsored by the active Owner-Occupier or Renter of the
 * same house. Each move-out path must leave no active co-resident whose sponsor no longer qualifies.
 *
 * The actions run against an in-memory resident_houses table: filters (eq/in/neq) and updates are
 * applied for real, so the invariant is checked on the rows the action leaves behind, not on the
 * calls it made. Other tables answer from fixed rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmRenterMoveOut } from '@/actions/residents/move-out-renter';
import { initiateOwnerMoveOut } from '@/actions/residents/move-out-owner';
import { moveOutLandlord } from '@/actions/residents/move-out-landlord';

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  // Makes the cascade update of secondary residents fail.
  failCascade: false,
  seq: 0,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true, userId: 'caller' })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn(async () => ({ documentId: 'doc-1', filePath: 'x', pdf: Buffer.alloc(0), alreadyIssued: false })) }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn(async () => ({ value: null, error: null })) }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: vi.fn(async () => 7) }));
vi.mock('@/actions/billing/get-invoices', () => ({
  getResidentIndebtedness: vi.fn(async () => ({ data: { totalUnpaid: 0, invoiceCount: 0 }, error: null })),
}));
vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: vi.fn(async () => ({ data: { balance: 100 }, error: null })),
}));

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) },
    from: (table: string) => {
      const rows = (h.tables[table] ??= []);
      const filters: Filter[] = [];
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
      let payload: Row | Row[] = {};
      let isCascade = false;

      const run = () => {
        if (op === 'insert') {
          const added = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: `row-${++h.seq}`, is_active: true, ...r }));
          rows.push(...added);
          return { data: added, error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'update') {
          if (table === 'resident_houses' && isCascade && h.failCascade) {
            return { data: null, error: { message: 'cascade failed' } };
          }
          hit.forEach((r) => Object.assign(r, payload));
        }
        if (op === 'delete') {
          h.tables[table] = rows.filter((r) => !hit.includes(r));
        }
        return { data: hit, error: null };
      };

      const chain: Record<string, unknown> = new Proxy({}, {
        get(_t, prop: string) {
          switch (prop) {
            case 'select':
              return () => chain;
            case 'insert':
            case 'update':
            case 'delete':
              return (arg?: Row | Row[]) => {
                op = prop;
                payload = arg ?? {};
                return chain;
              };
            case 'eq':
              return (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain);
            case 'neq':
              return (col: string, v: unknown) => (filters.push((r) => r[col] !== v), chain);
            case 'in':
              return (col: string, vs: unknown[]) => {
                if (col === 'resident_role' && vs.includes('household_member')) isCascade = true;
                filters.push((r) => vs.includes(r[col]));
                return chain;
              };
            case 'single':
            case 'maybeSingle':
              return async () => {
                const { data, error } = run();
                const first = Array.isArray(data) ? data[0] : null;
                if (error) return { data: null, error };
                return first ? { data: first, error: null } : { data: null, error: prop === 'single' ? { message: 'none' } : null };
              };
            case 'then':
              return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
            default:
              // order, limit, not, is, ... : no effect on these fixtures
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
const SPONSOR = 'res-sponsor';

function seed(sponsorRole: 'tenant' | 'resident_landlord', extra: Row[] = []) {
  h.seq = 0;
  h.failCascade = false;
  h.tables = {
    residents: [
      { id: SPONSOR, first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1', email: null, phone_primary: null, profile_id: null },
    ],
    houses: [{ id: HOUSE, house_number: '1', short_name: null, street: { name: 'Main' } }],
    house_ownership_history: [
      {
        id: 'hist-1',
        house_id: HOUSE,
        resident_id: SPONSOR,
        event_type: 'pending_move_out',
        is_current: true,
        notes: 'n',
        metadata: { certificate_number: 'CLR-1', destination: 'leaving_estate' },
      },
    ],
    resident_houses: [
      { id: 'rh-sponsor', resident_id: SPONSOR, house_id: HOUSE, resident_role: sponsorRole, is_active: true, sponsor_resident_id: null },
      { id: 'rh-co', resident_id: 'res-co', house_id: HOUSE, resident_role: 'co_resident', is_active: true, sponsor_resident_id: SPONSOR },
      { id: 'rh-staff', resident_id: 'res-staff', house_id: HOUSE, resident_role: 'domestic_staff', is_active: true, sponsor_resident_id: SPONSOR },
      ...extra,
    ],
  };
}

/** Active co-residents whose sponsor is not an active Owner-Occupier or Renter of the same house. */
function orphanedCoResidents(): Row[] {
  const rh = h.tables.resident_houses;
  return rh.filter(
    (c) =>
      c.resident_role === 'co_resident' &&
      c.is_active &&
      !rh.some(
        (s) =>
          s.resident_id === c.sponsor_resident_id &&
          s.house_id === c.house_id &&
          s.is_active &&
          ['resident_landlord', 'tenant'].includes(s.resident_role as string)
      )
  );
}

const row = (id: string) => h.tables.resident_houses.find((r) => r.id === id)!;

const PATHS = [
  { name: 'confirmRenterMoveOut', sponsorRole: 'tenant' as const, run: () => confirmRenterMoveOut(SPONSOR, HOUSE, 'CLR-1') },
  { name: 'initiateOwnerMoveOut', sponsorRole: 'resident_landlord' as const, run: () => initiateOwnerMoveOut({ residentId: SPONSOR, houseId: HOUSE }) },
  { name: 'moveOutLandlord', sponsorRole: 'resident_landlord' as const, run: () => moveOutLandlord(SPONSOR, HOUSE) },
];

describe.each(PATHS)('$name leaves no co-resident without an active sponsor (#1067)', ({ sponsorRole, run }) => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    seed(sponsorRole);
  });

  it('starts from a valid house: the co-resident is sponsored', () => {
    expect(orphanedCoResidents()).toHaveLength(0);
  });

  it('succeeds, ends the co-residency and moves the sponsor out', async () => {
    const res = await run();

    expect(res.success).toBe(true);
    expect(row('rh-co').is_active).toBe(false);
    const sponsor = row('rh-sponsor');
    expect(sponsor.is_active === false || sponsor.resident_role === 'non_resident_landlord').toBe(true);
    expect(orphanedCoResidents()).toHaveLength(0);
  });

  it('a failed cascade stops the move-out before the sponsor leaves', async () => {
    h.failCascade = true;

    const res = await run();

    expect(res.success).toBe(false);
    expect(row('rh-sponsor')).toMatchObject({ resident_role: sponsorRole, is_active: true });
    expect(row('rh-co').is_active).toBe(true);
    expect(orphanedCoResidents()).toHaveLength(0);
  });
});

describe('confirmRenterMoveOut into another house as a co-resident (#1067)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seed('tenant', [
      { id: 'rh-dest', resident_id: 'res-dest', house_id: 'house-2', resident_role: 'tenant', is_active: true, sponsor_resident_id: null },
    ]);
    h.tables.house_ownership_history[0].metadata = {
      certificate_number: 'CLR-1',
      destination: 'moving_within_estate',
      destination_house_id: 'house-2',
      destination_role: 'co_resident',
    };
  });

  it("is sponsored by the destination's Renter", async () => {
    const res = await confirmRenterMoveOut(SPONSOR, HOUSE, 'CLR-1');

    expect(res.success).toBe(true);
    const moved = h.tables.resident_houses.find((r) => r.house_id === 'house-2' && r.resident_id === SPONSOR);
    expect(moved).toMatchObject({ resident_role: 'co_resident', is_active: true, sponsor_resident_id: 'res-dest' });
    expect(orphanedCoResidents()).toHaveLength(0);
  });

  it('is not added when the destination has no Owner-Occupier or Renter', async () => {
    h.tables.resident_houses = h.tables.resident_houses.filter((r) => r.id !== 'rh-dest');

    await confirmRenterMoveOut(SPONSOR, HOUSE, 'CLR-1');

    expect(h.tables.resident_houses.some((r) => r.house_id === 'house-2')).toBe(false);
    expect(orphanedCoResidents()).toHaveLength(0);
  });
});
