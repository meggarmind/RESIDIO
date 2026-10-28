/**
 * Issue #710 -- the email-import auto-process limit is the
 * `email_import_auto_process_limit` setting. The generic writer must refuse a
 * value that would switch the approval control off, only super_admin may
 * change it (owner decision), and every accepted change is audited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { createSetting, updateSetting, updateSettings } from '@/actions/settings/update-setting';
import { settingValueError } from '@/lib/validators/setting-value';
import { EMAIL_AUTO_PROCESS_LIMIT_KEY } from '@/lib/email-imports/utils';

const { authorizePermission, createServerSupabaseClient, logAudit, calls, results } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

// This key needs settings.manage_general alone, so the any-of check forwards to the single one.
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission,
  authorizeAnyPermission: (permissions: string[]) => authorizePermission(permissions[0]),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const KEY = EMAIL_AUTO_PROCESS_LIMIT_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  authorizePermission.mockResolvedValue({ authorized: true, userId: uid(900), roleName: 'super_admin' });
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settingValueError for the auto-process limit', () => {
  it.each([1, 60000, '75000', 100_000_000])('accepts %s', (value) => {
    expect(settingValueError(KEY, value)).toBeNull();
  });

  it.each([0, -1, '-5', 1.5, '60000.5', NaN, Infinity, 'abc', '', true, null, 100_000_001])(
    'rejects %s',
    (value) => {
      expect(settingValueError(KEY, value)).toMatch(/whole naira amount from 1 to 100,000,000/);
    }
  );
});

describe('updateSetting for the auto-process limit', () => {
  it('audits an accepted change with the old and new value', async () => {
    results['system_settings.select'] = { data: { value: '60000' } };
    results['system_settings.update'] = { data: { id: uid(1), key: KEY, value: '80000' } };

    expect((await updateSetting(KEY, '80000')).error).toBeNull();

    expect(authorizePermission).toHaveBeenCalledWith('settings.manage_general');
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'system_settings', entityId: uid(1), entityDisplay: KEY })
    );
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ key: KEY, value: '80000' });
  });

  it('refuses a zero limit with no write and no audit', async () => {
    const result = await updateSetting(KEY, 0);

    expect(result.error).toMatch(/whole naira/);
    expect(calls.some((c) => c.includes('update'))).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a user without settings.manage_general', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    expect((await updateSetting(KEY, '80000')).error).toBe('Forbidden');
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses the financial officer, who holds settings.manage_billing but not settings.manage_general (#1283)', async () => {
    authorizePermission.mockImplementation(async (permission: string) =>
      permission === 'settings.manage_billing'
        ? { authorized: true, userId: uid(902), roleName: 'financial_officer' }
        : { authorized: false, error: 'Forbidden' }
    );

    expect((await updateSetting(KEY, '80000')).error).toBe('Forbidden');
    expect(authorizePermission).toHaveBeenCalledWith('settings.manage_general');
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('updateSettings refuses a batch carrying an invalid limit', async () => {
    const result = await updateSettings({ [KEY]: -1 });

    expect(result.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('super_admin-only save for the auto-process limit (owner decision on #710)', () => {
  // Holds settings.manage_general (authorizePermission passes) but is not super_admin.
  const asFinanceOfficer = () =>
    authorizePermission.mockResolvedValue({ authorized: true, userId: uid(901), roleName: 'finance_officer' });

  it('updateSetting refuses a non-super-admin with no write and no audit', async () => {
    asFinanceOfficer();
    results['system_settings.update'] = { data: { id: uid(1), key: KEY, value: '80000' } };

    const result = await updateSetting(KEY, '80000');

    expect(result.error).toBe(`Only a super admin can change "${KEY}"`);
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('updateSettings refuses a batch carrying the limit from a non-super-admin', async () => {
    asFinanceOfficer();
    results['system_settings.upsert'] = { data: { id: uid(2) } };

    const result = await updateSettings({ other_setting: 1, [KEY]: 80000 });

    expect(result).toEqual({ success: false, error: `Only a super admin can change "${KEY}"` });
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('createSetting refuses the limit key from a non-super-admin', async () => {
    asFinanceOfficer();
    results['system_settings.insert'] = { data: { id: uid(3) } };

    expect((await createSetting(KEY, '80000')).error).toMatch(/Only a super admin/);
    expect(calls).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('leaves other keys to settings.manage_general', async () => {
    asFinanceOfficer();
    results['system_settings.update'] = { data: { id: uid(4), key: 'other_setting', value: '2' } };

    expect((await updateSetting('other_setting', 2)).error).toBeNull();
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});
