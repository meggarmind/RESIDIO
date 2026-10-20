/**
 * Issue #840 -- each settings area's server actions enforce the area permission
 * its route admits (owner decision), not settings.manage_general or imports.create.
 * The authorize mock grants exactly the permissions in `held`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import { updateSetting, updateSettings } from '@/actions/settings/update-setting';
import { setRemindersEnabled } from '@/actions/notifications/reminder-config';
import { deleteBankAccount } from '@/actions/imports/bank-accounts';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { held, createServerSupabaseClient, calls, results } = vi.hoisted(() => ({
  held: new Set<string>(),
  createServerSupabaseClient: vi.fn(),
  calls: [] as string[],
  results: {} as Record<string, QueryResult>,
}));

vi.mock('@/lib/auth/authorize', () => {
  const result = (ok: boolean) => ({ authorized: ok, userId: 'u-1', roleName: 'treasurer', error: ok ? null : 'Forbidden' });
  return {
    authorizePermission: async (p: string) => result(held.has(p)),
    authorizeAnyPermission: async (ps: string[]) => result(ps.some((p) => held.has(p))),
  };
});
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn().mockResolvedValue(true) }));
vi.mock('@/actions/approvals', () => ({ canAutoApprove: vi.fn().mockResolvedValue(true) }));

beforeEach(() => {
  held.clear();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  results['system_settings.update'] = { data: { id: uid(1) } };
  results['system_settings.upsert'] = { data: { id: uid(1) } };
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results, calls }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('updateSetting enforces the area permission for area keys', () => {
  it.each([
    ['late_fee_amount', PERMISSIONS.SETTINGS_MANAGE_BILLING],
    ['bill_vacant_houses', PERMISSIONS.BILLING_MANAGE_PROFILES],
    ['current_development_levy_profile_id', PERMISSIONS.SETTINGS_MANAGE_BILLING],
    ['audit_log_retention_days', PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
    ['maintenance_message', PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
    ['invoice_reminders_enabled', PERMISSIONS.NOTIFICATIONS_MANAGE],
  ])('%s: allowed with %s', async (key, permission) => {
    held.add(permission);
    expect((await updateSetting(key, '90')).error).toBeNull();
  });

  it.each(['late_fee_amount', 'audit_log_retention_days', 'maintenance_message', 'invoice_reminders_enabled'])(
    '%s: refused with only settings.manage_general, nothing written',
    async (key) => {
      held.add(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
      expect((await updateSetting(key, '90')).error).toBe('Forbidden');
      expect(calls).toEqual([]);
    }
  );

  it('any other key still needs settings.manage_general', async () => {
    held.add(PERMISSIONS.SETTINGS_MANAGE_BILLING);
    expect((await updateSetting('estate_name', 'Oak')).error).toBe('Forbidden');
    held.add(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect((await updateSetting('estate_name', 'Oak')).error).toBeNull();
  });
});

describe('updateSettings needs every area the keys touch', () => {
  it('refuses a mixed batch unless both permissions are held', async () => {
    held.add(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
    const batch = { maintenance_message: 'Back soon', estate_name: 'Oak' };
    expect((await updateSettings(batch)).error).toBe('Forbidden');
    expect(calls).toEqual([]);
    held.add(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect((await updateSettings(batch)).success).toBe(true);
  });
});

describe('reminder config enforces notifications.manage end to end', () => {
  it('saves with notifications.manage alone', async () => {
    held.add(PERMISSIONS.NOTIFICATIONS_MANAGE);
    expect(await setRemindersEnabled(false)).toMatchObject({ success: true, enabled: false });
  });

  it('refuses settings.manage_general alone', async () => {
    held.add(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
    expect((await setRemindersEnabled(false)).success).toBe(false);
  });
});

describe('bank-account actions enforce settings.manage_reference', () => {
  it('refuses imports.create alone', async () => {
    held.add(PERMISSIONS.IMPORTS_CREATE);
    expect((await deleteBankAccount(uid(2))).error).toBe('Forbidden');
  });

  it('passes the check with settings.manage_reference', async () => {
    held.add(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
    // No row in the recording client: past the permission check, the lookup fails.
    expect((await deleteBankAccount(uid(2))).error).toBe('Bank account not found');
  });
});
