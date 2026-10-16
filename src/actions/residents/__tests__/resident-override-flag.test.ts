import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716, decision 2: only settings.manage_general may set or change
 * residents.use_override_comms, enforced in the server actions.
 */
const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  updatePayload: vi.fn(),
  insertPayload: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/email/send-welcome-email', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/actions/verification/send-verification', () => ({
  sendEmailVerification: vi.fn(),
  sendPhoneVerification: vi.fn(),
}));
vi.mock('@/actions/residents/validation', () => ({ validateHouseAssignment: vi.fn() }));

import { updateResident } from '@/actions/residents/update-resident';
import { createResident } from '@/actions/residents/create-resident';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { ResidentFormData } from '@/lib/validators/resident';

const UPDATE_ONLY = [PERMISSIONS.RESIDENTS_UPDATE, PERMISSIONS.RESIDENTS_CREATE];
const WITH_SETTINGS = [...UPDATE_ONLY, PERMISSIONS.SETTINGS_MANAGE_GENERAL];

function authAs(permissions: string[]) {
  mocks.authorizePermission.mockResolvedValue({
    authorized: true,
    userId: 'user-1',
    roleName: 'test',
    roleId: 'role-1',
    permissions,
    error: null,
  });
}

/** The flag query used by loadResidentOverrideFlags. */
function storedFlag(value: boolean | null | 'error') {
  mocks.createAdminClient.mockReturnValue({
    from: () => ({
      select: () => ({
        in: async () =>
          value === 'error'
            ? { data: null, error: { message: 'db down' } }
            : { data: [{ id: 'res-1', use_override_comms: value }], error: null },
      }),
    }),
  });
}

const CURRENT = {
  email: 'a@example.test',
  phone_primary: '08000000000',
  email_verified_at: null,
  phone_verified_at: null,
  first_name: 'Test',
  last_name: 'Person',
};

function updateClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CURRENT, error: null }) }) }),
      update: (payload: unknown) => {
        mocks.updatePayload(payload);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'res-1', ...(payload as object) }, error: null }) }) }) };
      },
    }),
  };
}

const FORM: ResidentFormData = {
  first_name: 'Test',
  last_name: 'Person',
  email: 'a@example.test',
  phone_primary: '08000000000',
  resident_type: 'primary',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerSupabaseClient.mockResolvedValue(updateClient());
  storedFlag(null);
});

describe('updateResident: use_override_comms permission (#716)', () => {
  it('rejects a change from a RESIDENTS_UPDATE-only user with a clear error and writes nothing', async () => {
    authAs(UPDATE_ONLY);
    const result = await updateResident('res-1', { ...FORM, use_override_comms: true });

    expect(result.data).toBeNull();
    expect(result.error).toContain('settings.manage_general');
    expect(mocks.updatePayload).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('also rejects clearing a stored value (true -> null) from that user', async () => {
    authAs(UPDATE_ONLY);
    storedFlag(true);
    const result = await updateResident('res-1', { ...FORM, use_override_comms: null });
    expect(result.error).toContain('settings.manage_general');
    expect(mocks.updatePayload).not.toHaveBeenCalled();
  });

  it('lets a user who holds settings.manage_general change it, and writes the new value', async () => {
    authAs(WITH_SETTINGS);
    const result = await updateResident('res-1', { ...FORM, use_override_comms: false });

    expect(result.error).toBeNull();
    expect(mocks.updatePayload).toHaveBeenCalledWith(expect.objectContaining({ use_override_comms: false }));
  });

  it('audits the change with old and new values', async () => {
    authAs(WITH_SETTINGS);
    storedFlag(null);
    await updateResident('res-1', { ...FORM, use_override_comms: true });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.logAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'UPDATE', entityType: 'residents', entityId: 'res-1' });
    expect(audit.oldValues).toMatchObject({ use_override_comms: null });
    expect(audit.newValues).toMatchObject({ use_override_comms: true });
  });

  it('does not put the flag in the audit entry when it did not change', async () => {
    authAs(WITH_SETTINGS);
    storedFlag(true);
    await updateResident('res-1', { ...FORM, use_override_comms: true });
    const audit = mocks.logAudit.mock.calls[0][0];
    expect(audit.newValues).not.toHaveProperty('use_override_comms');
    expect(mocks.updatePayload.mock.calls[0][0]).not.toHaveProperty('use_override_comms');
  });

  it('lets an update-only user save the form when the field is absent or unchanged', async () => {
    authAs(UPDATE_ONLY);
    const absent = await updateResident('res-1', FORM);
    expect(absent.error).toBeNull();
    expect(mocks.updatePayload.mock.calls[0][0]).not.toHaveProperty('use_override_comms');

    storedFlag(false);
    const same = await updateResident('res-1', { ...FORM, use_override_comms: false });
    expect(same.error).toBeNull();
    expect(mocks.updatePayload.mock.calls[1][0]).not.toHaveProperty('use_override_comms');
  });

  it('fails closed when the stored flag cannot be read: error, no write', async () => {
    authAs(WITH_SETTINGS);
    storedFlag('error');
    const result = await updateResident('res-1', { ...FORM, use_override_comms: true });
    expect(result.error).toContain('communications override');
    expect(mocks.updatePayload).not.toHaveBeenCalled();
  });
});

describe('createResident: use_override_comms permission (#716)', () => {
  function createClient() {
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: () => ({
        insert: (payload: unknown) => {
          mocks.insertPayload(payload);
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'res-9', resident_code: 'R-9', first_name: 'New', last_name: 'Person', email: null, phone_primary: '' },
                error: null,
              }),
            }),
          };
        },
      }),
    };
  }

  beforeEach(() => mocks.createServerSupabaseClient.mockResolvedValue(createClient()));

  it('ignores the field for a user without settings.manage_general', async () => {
    authAs(UPDATE_ONLY);
    const result = await createResident({ ...FORM, use_override_comms: true });

    expect(result.error).toBeNull();
    expect(mocks.insertPayload).toHaveBeenCalledTimes(1);
    expect(mocks.insertPayload.mock.calls[0][0]).not.toHaveProperty('use_override_comms');
    expect(mocks.logAudit.mock.calls[0][0].newValues).not.toHaveProperty('use_override_comms');
  });

  it.each([true, false, null])('stores %s for a user who holds settings.manage_general', async (value) => {
    authAs(WITH_SETTINGS);
    await createResident({ ...FORM, use_override_comms: value });

    expect(mocks.insertPayload.mock.calls[0][0]).toHaveProperty('use_override_comms', value);
    expect(mocks.logAudit.mock.calls[0][0].newValues).toHaveProperty('use_override_comms', value);
  });

  it('leaves the column out entirely when the field was not submitted', async () => {
    authAs(WITH_SETTINGS);
    await createResident(FORM);
    expect(mocks.insertPayload.mock.calls[0][0]).not.toHaveProperty('use_override_comms');
  });
});
