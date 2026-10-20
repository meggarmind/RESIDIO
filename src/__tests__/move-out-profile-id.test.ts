/**
 * Issue #585 -- move-out actions keyed self-service and the notification recipient on
 * residents.user_id (nonexistent). They must use residents.profile_id.
 *
 * Covered: the whole initiate flow for a leaving-estate renter and an owner-occupier,
 * against a recording mock client. confirmRenterMoveOut's notification.
 * Not covered: confirm's moving-within-estate branch, the cancel path, and the
 * staff-notification block (see move-out-staff-notify.test.ts, #626).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initiateRenterMoveOut, confirmRenterMoveOut } from '@/actions/residents/move-out-renter';
import { initiateOwnerMoveOut } from '@/actions/residents/move-out-owner';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { issueClearanceCertificate } from '@/lib/clearance/issue-certificate';
import { sendEmail } from '@/lib/email/send-email';

type Op = { table: string; op: string; arg?: unknown };

const h = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  ops: [] as { table: string; op: string; arg?: unknown }[],
  state: {
    userId: 'caller',
    resident: null as Record<string, unknown> | null,
    role: 'tenant',
    pending: null as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: h.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: h.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn(async () => ({ documentId: 'doc-1', filePath: 'x', pdf: Buffer.alloc(0), alreadyIssued: false })) }));
// The stored flag (#716) comes from flagState; the lookup itself is covered in comms-override/__tests__.
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
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
    case 'house_ownership_history':
      return h.state.pending;
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

  it.each([
    ['null profile_id', null],
    ['a different profile_id', 'someone-else'],
  ])('denied permission with %s: error, permission checked, no write, no audit', async (_label, profileId) => {
    h.state.resident = { ...(h.state.resident as object), profile_id: profileId };
    h.authorizePermission.mockImplementation(async () => {
      h.ops.push({ table: '-', op: 'authorize' });
      return { authorized: false, error: 'Nope' };
    });
    const res = await run();
    expect(res).toEqual({ success: false, error: 'Nope' });
    expect(h.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
    expect(writes()).toHaveLength(0);
    expect(h.logAudit).not.toHaveBeenCalled();
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

describe.each(CASES)('$name emails the resident with the stored override flag (#716)', ({ role, run }) => {
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
      email: 'ada@example.test',
      phone_primary: null,
      profile_id: 'profile-1',
    };
    h.authorizePermission.mockResolvedValue({ authorized: true });
    flagState.error = null;
    flagState.byId = new Map([['res-1', null]]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([true, false, null])('stored %s reaches sendEmail unchanged', async (stored) => {
    flagState.byId = new Map([['res-1', stored]]);

    const res = await run();

    expect(res.success).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toHaveProperty('residentOverride', stored);
  });

  it('fails closed when the flag cannot be read: no email, the move-out still succeeds, the reason is logged', async () => {
    flagState.error = 'db down';

    const res = await run();

    expect(res.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Email not sent'), expect.stringContaining('could not read resident flag'));
  });

  it('saves the certificate and copies it to the recipient group as the caller (#816 decisions 20, 22)', async () => {
    const res = await run();

    expect(res.success).toBe(true);
    expect(issueClearanceCertificate).toHaveBeenCalledTimes(1);
    expect(issueClearanceCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'move_out', issuedBy: 'caller', certificate: expect.objectContaining({ residentId: 'res-1' }) })
    );
  });

  it('still succeeds, and logs, when the certificate cannot be saved', async () => {
    vi.mocked(issueClearanceCertificate).mockRejectedValueOnce(new Error('storage down'));

    const res = await run();

    expect(res.success).toBe(true);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Certificate not saved or copied'), expect.any(Error));
  });

  it('sends no email and looks nothing up when the resident has no email address', async () => {
    h.state.resident = { ...(h.state.resident as object), email: null };
    flagState.error = 'db down';

    const res = await run();

    expect(res.success).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('confirmRenterMoveOut notifies residents.profile_id (#585)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ops.length = 0;
    h.state.userId = 'cso';
    h.state.role = 'tenant';
    h.state.pending = { id: 'hist-1', notes: 'n', metadata: { certificate_number: 'CLR-1' } };
    h.state.resident = { first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1', profile_id: 'profile-1' };
    h.authorizePermission.mockResolvedValue({ authorized: true });
  });

  it('selects profile_id and notifies it with the confirmation title', async () => {
    const res = await confirmRenterMoveOut('res-1', 'house-1', 'CLR-1');
    expect(res.success).toBe(true);
    expect(residentSelect()).toContain('profile_id');
    expect(residentSelect()).not.toContain('user_id');
    const n = notifications();
    expect(n).toHaveLength(1);
    expect(n[0].arg).toMatchObject({ recipient_id: 'profile-1', title: 'Move-Out Confirmed' });
  });

  it('skips the notification when profile_id is null and still succeeds', async () => {
    h.state.resident = { ...(h.state.resident as object), profile_id: null };
    const res = await confirmRenterMoveOut('res-1', 'house-1', 'CLR-1');
    expect(res.success).toBe(true);
    expect(notifications()).toHaveLength(0);
  });
});
