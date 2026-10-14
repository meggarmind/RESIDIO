/**
 * Issue #585 -- move-out actions keyed self-service and the notification recipient on
 * residents.user_id (nonexistent). They must use residents.profile_id.
 *
 * Covered: the whole initiate flow for a leaving-estate renter and an owner-occupier,
 * against a recording mock client. Not covered: confirmRenterMoveOut / the cancel path,
 * and the staff-notification block (left untouched, see #585).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initiateRenterMoveOut } from '@/actions/residents/move-out-renter';
import { initiateOwnerMoveOut } from '@/actions/residents/move-out-owner';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type Op = { table: string; op: string; arg?: unknown };

const h = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  ops: [] as { table: string; op: string; arg?: unknown }[],
  state: {
    userId: 'caller',
    resident: null as Record<string, unknown> | null,
    role: 'tenant',
  },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: h.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: h.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: vi.fn(async () => 7) }));
vi.mock('@/actions/billing/get-invoices', () => ({
  getResidentIndebtedness: vi.fn(async () => ({ data: { totalUnpaid: 0, invoiceCount: 0 }, error: null })),
}));
vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: vi.fn(async () => ({ data: { balance: 100 }, error: null })),
}));

function singleFor(table: string) {
  switch (table) {
    case 'residents':
      return h.state.resident;
    case 'resident_houses':
      return { id: 'rh-1', resident_role: h.state.role };
    case 'houses':
      return { id: 'house-1', house_number: '1', short_name: null, street: { name: 'Main' } };
    default:
      return null;
  }
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: h.state.userId } } }) },
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (arg?: unknown) => {
        h.ops.push({ table, op, arg });
        return chain;
      };
      for (const m of ['select', 'insert', 'update', 'delete']) chain[m] = record(m);
      for (const m of ['eq', 'in', 'order']) chain[m] = () => chain;
      chain.single = async () => {
        const data = singleFor(table);
        return { data, error: data ? null : { message: 'none' } };
      };
      // Awaiting a chain directly (no .single()) yields an empty result.
      chain.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => makeClient(),
  createAdminClient: () => makeClient(),
}));

const WRITES = ['insert', 'update', 'delete'];
const writes = () => h.ops.filter((o: Op) => WRITES.includes(o.op));
const residentSelect = () => h.ops.find((o: Op) => o.table === 'residents' && o.op === 'select')?.arg as string;
const notifications = () =>
  h.ops.filter((o: Op) => o.table === 'in_app_notifications' && o.op === 'insert' && !Array.isArray(o.arg));

const CASES = [
  {
    name: 'initiateRenterMoveOut',
    role: 'tenant',
    run: () => initiateRenterMoveOut({ residentId: 'res-1', houseId: 'house-1', destination: 'leaving_estate' }),
  },
  {
    name: 'initiateOwnerMoveOut',
    role: 'resident_landlord',
    run: () => initiateOwnerMoveOut({ residentId: 'res-1', houseId: 'house-1' }),
  },
];

describe.each(CASES)('$name uses residents.profile_id (#585)', ({ role, run }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ops.length = 0;
    h.state.userId = 'caller';
    h.state.role = role;
    h.state.resident = {
      id: 'res-1',
      first_name: 'Ada',
      last_name: 'Obi',
      resident_code: 'R-1',
      email: null,
      phone_primary: null,
      profile_id: 'profile-1',
    };
    // Record the permission check in the same timeline as the writes.
    h.authorizePermission.mockImplementation(async () => {
      h.ops.push({ table: '-', op: 'authorize' });
      return { authorized: true };
    });
  });

  it('selects profile_id and not user_id from residents', async () => {
    await run();
    const select = residentSelect();
    expect(select).toContain('profile_id');
    expect(select).not.toContain('user_id');
  });

  it('admin path: checks HOUSES_ASSIGN_RESIDENT before any write', async () => {
    const res = await run();
    expect(res.success).toBe(true);
    expect(h.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
    const authAt = h.ops.findIndex((o: Op) => o.op === 'authorize');
    const writeAt = h.ops.findIndex((o: Op) => WRITES.includes(o.op));
    expect(authAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(writeAt);
  });

  it('admin path: denied permission returns the error and performs no write', async () => {
    h.authorizePermission.mockImplementation(async () => {
      h.ops.push({ table: '-', op: 'authorize' });
      return { authorized: false, error: 'Nope' };
    });
    const res = await run();
    expect(res).toEqual({ success: false, error: 'Nope' });
    expect(writes()).toHaveLength(0);
  });

  it('self-service: caller profile equals resident.profile_id, no permission call', async () => {
    h.state.userId = 'profile-1';
    const res = await run();
    expect(res.success).toBe(true);
    expect(h.authorizePermission).not.toHaveBeenCalled();
  });

  it('notifies the resident profile_id', async () => {
    await run();
    const n = notifications();
    expect(n).toHaveLength(1);
    expect((n[0].arg as { recipient_id: string }).recipient_id).toBe('profile-1');
  });

  it('skips the in-app notification when profile_id is null and still succeeds', async () => {
    h.state.resident = { ...(h.state.resident as object), profile_id: null };
    const res = await run();
    expect(res.success).toBe(true);
    expect(notifications()).toHaveLength(0);
  });
});
