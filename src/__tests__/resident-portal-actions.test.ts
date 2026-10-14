import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  getPortalAccessOverrides,
  getResidentPortalEnabled,
  setPortalAccessOverride,
  setResidentPortalEnabled,
} from '@/actions/settings/resident-portal';

const { createAdminClient, authorizePermission, logAudit, revalidatePath } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath }));

const SETTING_ROW_ID = '00000000-0000-4000-8000-000000000001';

type Result = { data: unknown; error: unknown };

/**
 * Minimal chainable stand-in for the Supabase query builder. Reads resolve
 * with `readResult` (via maybeSingle() or by awaiting the chain); writes
 * (update/upsert) resolve with `writeResult`. Every call is recorded.
 */
function createClient(readResult: Result, writeResult: Result = { data: null, error: null }) {
  const calls = {
    from: [] as string[],
    select: [] as string[],
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    update: [] as unknown[],
    upsert: [] as Array<[unknown, unknown]>,
  };

  function builder(result: Result) {
    const chain: Record<string, unknown> = {
      select: (columns: string) => {
        calls.select.push(columns);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        calls.eq.push([column, value]);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        calls.in.push([column, values]);
        return chain;
      },
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      update: (values: unknown) => {
        calls.update.push(values);
        return builder(writeResult);
      },
      upsert: (values: unknown, options: unknown) => {
        calls.upsert.push([values, options]);
        return builder(writeResult);
      },
      then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }

  const client = {
    from: (table: string) => {
      calls.from.push(table);
      return builder(readResult);
    },
  };
  return { client, calls };
}

const PROFILE_ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const OTHER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

beforeEach(() => {
  createAdminClient.mockReset();
  authorizePermission.mockReset();
  logAudit.mockReset();
  revalidatePath.mockReset();
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1', error: null });
});

describe('getResidentPortalEnabled', () => {
  it('requires settings.view and returns early when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const result = await getResidentPortalEnabled();

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_VIEW);
    expect(result).toEqual({ success: false, data: null, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    [null, false],
    [{ value: false }, false],
    [{ value: 'false' }, false],
    [{ value: 'yes' }, false],
    [{ value: true }, true],
    [{ value: 'true' }, true],
  ])('reads row %j as %s', async (row, expected) => {
    const { client, calls } = createClient({ data: row, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await getResidentPortalEnabled();

    expect(result).toEqual({ success: true, data: expected, error: null });
    expect(calls.from).toEqual(['system_settings']);
    expect(calls.eq).toEqual([['key', 'resident_portal_enabled']]);
  });

  it('surfaces a read error', async () => {
    const { client } = createClient({ data: null, error: { message: 'boom' } });
    createAdminClient.mockReturnValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await getResidentPortalEnabled()).toEqual({ success: false, data: null, error: 'boom' });
  });
});

describe('setResidentPortalEnabled', () => {
  it('requires settings.manage_general and does not write or audit when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const result = await setResidentPortalEnabled(true);

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect(result).toEqual({ success: false, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('upserts the switch and audits the old and new values', async () => {
    const { client, calls } = createClient({ data: { value: false }, error: null }, { data: { id: SETTING_ROW_ID }, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setResidentPortalEnabled(true);

    expect(result).toEqual({ success: true, error: null });
    expect(calls.upsert).toEqual([
      [{ key: 'resident_portal_enabled', value: true, category: 'general' }, { onConflict: 'key' }],
    ]);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'system_settings',
        // audit_logs.entity_id is a uuid: the settings row id, not the key (#594)
        entityId: SETTING_ROW_ID,
        oldValues: { key: 'resident_portal_enabled', resident_portal_enabled: false },
        newValues: { key: 'resident_portal_enabled', resident_portal_enabled: true },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/settings/estate-info');
  });

  it('records a missing row as a null old value', async () => {
    const { client } = createClient({ data: null, error: null }, { data: { id: SETTING_ROW_ID }, error: null });
    createAdminClient.mockReturnValue(client);

    await setResidentPortalEnabled(false);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { key: 'resident_portal_enabled', resident_portal_enabled: null },
        newValues: { key: 'resident_portal_enabled', resident_portal_enabled: false },
      })
    );
  });

  it('does not write or audit when reading the previous value fails', async () => {
    const { client, calls } = createClient({ data: null, error: { message: 'read failed' } });
    createAdminClient.mockReturnValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await setResidentPortalEnabled(true);

    expect(result).toEqual({ success: false, error: 'Failed to load the resident portal switch' });
    expect(calls.upsert).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the upsert returns no row id', async () => {
    const { client } = createClient({ data: { value: false }, error: null }, { data: null, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setResidentPortalEnabled(true);

    expect(result.success).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the upsert fails', async () => {
    const { client } = createClient({ data: { value: false }, error: null }, { data: null, error: { message: 'boom' } });
    createAdminClient.mockReturnValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await setResidentPortalEnabled(true);

    expect(result.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean without writing', async () => {
    const { client, calls } = createClient({ data: null, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setResidentPortalEnabled('true' as unknown as boolean);

    expect(result.success).toBe(false);
    expect(calls.upsert).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('getPortalAccessOverrides', () => {
  it('requires system.assign_roles and returns early when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const result = await getPortalAccessOverrides([PROFILE_ID]);

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
    expect(result).toEqual({ success: false, data: null, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns overrides keyed by id, normalising junk to null', async () => {
    const { client, calls } = createClient({
      data: [
        { id: PROFILE_ID, portal_access_override: 'enabled' },
        { id: OTHER_ID, portal_access_override: 'garbage' },
      ],
      error: null,
    });
    createAdminClient.mockReturnValue(client);

    const result = await getPortalAccessOverrides([PROFILE_ID, OTHER_ID]);

    expect(result).toEqual({ success: true, data: { [PROFILE_ID]: 'enabled', [OTHER_ID]: null }, error: null });
    expect(calls.from).toEqual(['profiles']);
    expect(calls.in).toEqual([['id', [PROFILE_ID, OTHER_ID]]]);
  });

  it('returns an empty map for no ids without querying', async () => {
    expect(await getPortalAccessOverrides([])).toEqual({ success: true, data: {}, error: null });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects malformed ids without querying', async () => {
    const result = await getPortalAccessOverrides([PROFILE_ID, 'not-a-uuid']);

    expect(result.success).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe('setPortalAccessOverride', () => {
  const existing = { id: PROFILE_ID, full_name: 'Ada Admin', email: 'ada@example.test', portal_access_override: null };

  it('requires system.assign_roles and does not write or audit when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const result = await setPortalAccessOverride(PROFILE_ID, 'enabled');

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
    expect(result).toEqual({ success: false, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('updates the override and audits the old and new values', async () => {
    const { client, calls } = createClient({ data: existing, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setPortalAccessOverride(PROFILE_ID, 'enabled');

    expect(result).toEqual({ success: true, error: null });
    expect(calls.update).toEqual([{ portal_access_override: 'enabled' }]);
    expect(calls.eq).toEqual([
      ['id', PROFILE_ID],
      ['id', PROFILE_ID],
    ]);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      action: 'UPDATE',
      entityType: 'profiles',
      entityId: PROFILE_ID,
      entityDisplay: 'Ada Admin',
      oldValues: { portal_access_override: null },
      newValues: { portal_access_override: 'enabled' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/system/accounts');
  });

  it('clears an override back to inherit and falls back to email for the display name', async () => {
    const { client, calls } = createClient({
      data: { ...existing, full_name: '', portal_access_override: 'disabled' },
      error: null,
    });
    createAdminClient.mockReturnValue(client);

    await setPortalAccessOverride(PROFILE_ID, null);

    expect(calls.update).toEqual([{ portal_access_override: null }]);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityDisplay: 'ada@example.test',
        oldValues: { portal_access_override: 'disabled' },
        newValues: { portal_access_override: null },
      })
    );
  });

  it.each(['inherit', 'Enabled', '', undefined, true])('rejects override %j without a write', async (override) => {
    const { client, calls } = createClient({ data: existing, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setPortalAccessOverride(PROFILE_ID, override as unknown as 'enabled');

    expect(result).toEqual({ success: false, error: 'Invalid portal access override' });
    expect(calls.update).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-uuid', `${PROFILE_ID}x`])('rejects profile id %j without a write', async (profileId) => {
    const { client, calls } = createClient({ data: existing, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setPortalAccessOverride(profileId, 'enabled');

    expect(result).toEqual({ success: false, error: 'Invalid profile id' });
    expect(calls.update).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not write or audit when reading the profile fails', async () => {
    const { client, calls } = createClient({ data: null, error: { message: 'read failed' } });
    createAdminClient.mockReturnValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await setPortalAccessOverride(PROFILE_ID, 'enabled');

    expect(result).toEqual({ success: false, error: 'Failed to load the profile' });
    expect(calls.update).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not write when the profile does not exist', async () => {
    const { client, calls } = createClient({ data: null, error: null });
    createAdminClient.mockReturnValue(client);

    const result = await setPortalAccessOverride(PROFILE_ID, 'enabled');

    expect(result).toEqual({ success: false, error: 'Profile not found' });
    expect(calls.update).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not audit when the update fails', async () => {
    const { client } = createClient({ data: existing, error: null }, { data: null, error: { message: 'boom' } });
    createAdminClient.mockReturnValue(client);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await setPortalAccessOverride(PROFILE_ID, 'disabled');

    expect(result.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
