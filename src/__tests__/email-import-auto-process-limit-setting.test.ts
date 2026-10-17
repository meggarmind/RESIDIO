/**
 * Issue #710 -- the email-import auto-process limit is the
 * `email_import_auto_process_limit` setting. The generic writer must refuse a
 * value that would switch the approval control off, and every accepted change
 * is audited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { updateSetting, updateSettings } from '@/actions/settings/update-setting';
import { settingValueError } from '@/lib/validators/setting-value';
import { EMAIL_AUTO_PROCESS_LIMIT_KEY } from '@/lib/email-imports/utils';

const { authorizePermission, createServerSupabaseClient, logAudit, calls, results } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
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

  it('updateSettings refuses a batch carrying an invalid limit', async () => {
    const result = await updateSettings({ [KEY]: -1 });

    expect(result.success).toBe(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
