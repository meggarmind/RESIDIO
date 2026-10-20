/**
 * Issue #626 -- initiateRenterMoveOut notifies holders of the roles in
 * MOVE_OUT_NOTIFY_ROLES. The old block queried nonexistent tables and notified nobody.
 *
 * The recording mock applies .eq/.in filters to fixture rows, so a lookup that drops
 * its role or status filter returns the wrong recipients and the tests fail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initiateRenterMoveOut } from '@/actions/residents/move-out-renter';
import { MOVE_OUT_NOTIFY_ROLES } from '@/lib/residents/move-out-recipients';

type Row = Record<string, unknown>;
type Op = { client: 'server' | 'admin'; table: string; op: string; arg?: unknown };

const h = vi.hoisted(() => ({
  ops: [] as { client: 'server' | 'admin'; table: string; op: string; arg?: unknown }[],
  state: {
    roles: [] as Record<string, unknown>[],
    profiles: [] as Record<string, unknown>[],
    roleError: null as { message: string } | null,
    profileError: null as { message: string } | null,
    staffInsertError: null as { message: string } | null,
    roleThrows: false,
  },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn(async () => ({ documentId: 'doc-1', filePath: 'x', pdf: Buffer.alloc(0), alreadyIssued: false })) }));
vi.mock('@/lib/settings/get-system-setting', () => ({ getSystemSetting: vi.fn(async () => 7) }));
vi.mock('@/actions/billing/get-invoices', () => ({
  getResidentIndebtedness: vi.fn(async () => ({ data: { totalUnpaid: 0, invoiceCount: 0 }, error: null })),
}));
vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: vi.fn(async () => ({ data: { balance: 100 }, error: null })),
}));

const RESIDENT = {
  id: 'res-1',
  first_name: 'Ada',
  last_name: 'Obi',
  resident_code: 'R-1',
  email: null,
  phone_primary: null,
  profile_id: 'profile-resident',
};

function singleFor(table: string) {
  switch (table) {
    case 'residents':
      return RESIDENT;
    case 'resident_houses':
      return { id: 'rh-1', resident_role: 'tenant' };
    case 'houses':
      return { id: 'house-1', house_number: '1', short_name: null, street: { name: 'Main' } };
    default:
      return null;
  }
}

function makeClient(client: 'server' | 'admin') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) },
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = [];
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (arg?: unknown) => {
        h.ops.push({ client, table, op, arg });
        return chain;
      };
      for (const m of ['select', 'insert', 'update', 'delete']) chain[m] = record(m);
      chain.order = () => chain;
      chain.eq = (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return chain;
      };
      chain.in = (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      };
      chain.single = async () => {
        const data = singleFor(table);
        return { data, error: data ? null : { message: 'none' } };
      };
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const isInsert = h.ops.some((o) => o.client === client && o.table === table && o.op === 'insert');
        let result: { data: unknown; error: unknown } = { data: [], error: null };
        try {
          if (table === 'app_roles') {
            if (h.state.roleThrows) throw new Error('boom');
            result = h.state.roleError
              ? { data: null, error: h.state.roleError }
              : { data: h.state.roles.filter((r) => filters.every((f) => f(r))), error: null };
          } else if (table === 'profiles') {
            result = h.state.profileError
              ? { data: null, error: h.state.profileError }
              : { data: h.state.profiles.filter((r) => filters.every((f) => f(r))), error: null };
          } else if (table === 'in_app_notifications' && isInsert) {
            const last = [...h.ops].reverse().find((o) => o.table === table && o.op === 'insert');
            if (Array.isArray(last?.arg) && h.state.staffInsertError) {
              result = { data: null, error: h.state.staffInsertError };
            }
          }
        } catch (e) {
          return Promise.reject(e).then(res, rej);
        }
        return Promise.resolve(result).then(res, rej);
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => makeClient('server'),
  createAdminClient: () => makeClient('admin'),
}));

const staffInserts = () =>
  h.ops.filter((o: Op) => o.table === 'in_app_notifications' && o.op === 'insert' && Array.isArray(o.arg));
const staffRows = () => staffInserts().flatMap((o: Op) => o.arg as Row[]);
const residentInserts = () =>
  h.ops.filter((o: Op) => o.table === 'in_app_notifications' && o.op === 'insert' && !Array.isArray(o.arg));

const run = () => initiateRenterMoveOut({ residentId: 'res-1', houseId: 'house-1', destination: 'leaving_estate' });

describe('initiateRenterMoveOut staff notification (#626)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ops.length = 0;
    h.state.roles = [
      { id: 'role-fo', name: 'financial_officer' },
      { id: 'role-so', name: 'security_officer' },
      { id: 'role-ch', name: 'chairman' },
    ];
    h.state.profiles = [
      { id: 'p-fo', role_id: 'role-fo', approval_status: 'active' },
      { id: 'p-so', role_id: 'role-so', approval_status: 'active' },
      { id: 'p-ch', role_id: 'role-ch', approval_status: 'active' },
      { id: 'p-fo-suspended', role_id: 'role-fo', approval_status: 'suspended' },
    ];
    h.state.roleError = null;
    h.state.profileError = null;
    h.state.staffInsertError = null;
    h.state.roleThrows = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('notifies exactly the active profiles holding the two roles, by profile id', async () => {
    const res = await run();
    expect(res.success).toBe(true);
    expect(MOVE_OUT_NOTIFY_ROLES).toEqual(['security_officer', 'financial_officer']);
    expect(staffInserts()).toHaveLength(1);
    expect(staffRows().map((r) => r.recipient_id).sort()).toEqual(['p-fo', 'p-so']);
  });

  it('builds the same notification shape as before', async () => {
    await run();
    const row = staffRows()[0];
    expect(row).toMatchObject({
      title: 'Renter Move-Out Initiated',
      category: 'admin',
      entity_type: 'clearance_certificate',
      action_url: '/houses/house-1',
      priority: 'normal',
    });
    expect(row.body).toContain('Ada Obi (R-1) has initiated move-out from 1, Main');
    expect(row.body).toContain('Certificate: ');
    expect(row.entity_id).toBeTruthy();
  });

  it('still notifies the resident profile separately', async () => {
    await run();
    expect(residentInserts()).toHaveLength(1);
    expect((residentInserts()[0].arg as Row).recipient_id).toBe('profile-resident');
  });

  it('does no staff insert and still succeeds when no profile holds the roles', async () => {
    h.state.profiles = [{ id: 'p-ch', role_id: 'role-ch', approval_status: 'active' }];
    const res = await run();
    expect(res.success).toBe(true);
    expect(staffInserts()).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('does no staff insert when the roles are not seeded', async () => {
    h.state.roles = [];
    const res = await run();
    expect(res.success).toBe(true);
    expect(staffInserts()).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('logs a role lookup error and the move-out still succeeds', async () => {
    h.state.roleError = { message: 'role boom' };
    const res = await run();
    expect(res.success).toBe(true);
    expect(staffInserts()).toHaveLength(0);
    expect(residentInserts()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Staff role lookup'), h.state.roleError);
  });

  it('logs a profile lookup error and the move-out still succeeds', async () => {
    h.state.profileError = { message: 'profile boom' };
    const res = await run();
    expect(res.success).toBe(true);
    expect(staffInserts()).toHaveLength(0);
    expect(residentInserts()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Staff profile lookup'), h.state.profileError);
  });

  it('survives a thrown lookup', async () => {
    h.state.roleThrows = true;
    const res = await run();
    expect(res.success).toBe(true);
    expect(residentInserts()).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('logs a staff insert error and the move-out still succeeds', async () => {
    h.state.staffInsertError = { message: 'insert boom' };
    const res = await run();
    expect(res.success).toBe(true);
    expect(residentInserts()).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Staff notification insert'), h.state.staffInsertError);
  });

  it('uses the admin client for the lookups and the staff insert', async () => {
    await run();
    const lookups = h.ops.filter((o: Op) => o.table === 'app_roles' || o.table === 'profiles');
    expect(lookups.length).toBeGreaterThan(0);
    expect(lookups.every((o: Op) => o.client === 'admin')).toBe(true);
    expect(staffInserts().every((o: Op) => o.client === 'admin')).toBe(true);
  });
});
