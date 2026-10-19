/**
 * Issue #594 part 2 -- toggleRemindersEnabled (now setRemindersEnabled) audited with the settings KEY as entityId
 * (never written: audit_logs.entity_id is uuid). It now uses the row id returned by
 * updateSetting, keeps the key in the values, and skips the audit when no row came back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectUuidEntityId, uid } from '@/__tests__/helpers/recording-supabase';
import { setRemindersEnabled } from '@/actions/notifications/reminder-config';

const { authorizePermission, logAudit, updateSetting, getSettingValueAsService } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  updateSetting: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting }));

beforeEach(() => {
  vi.clearAllMocks();
  authorizePermission.mockResolvedValue({ authorized: true, userId: uid(900) });
  getSettingValueAsService.mockResolvedValue(true);
});

describe('setRemindersEnabled audit', () => {
  it('audits once with the settings row id and keeps the key in the values', async () => {
    updateSetting.mockResolvedValue({ data: { id: uid(1) }, error: null });
    expect((await setRemindersEnabled(false)).success).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expectUuidEntityId(logAudit);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEACTIVATE', entityType: 'system_settings', entityId: uid(1), entityDisplay: 'Invoice Reminders' })
    );
    expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ enabled: false });
    expect(logAudit.mock.calls[0][0].newValues.key).toEqual(expect.any(String));
  });
  it('does not audit when updateSetting returns no row', async () => {
    updateSetting.mockResolvedValue({ data: null, error: 'nope' });
    await setRemindersEnabled(false);
    expect(logAudit).not.toHaveBeenCalled();
  });
  it('writes the state it is given instead of flipping the stored one (#790)', async () => {
    getSettingValueAsService.mockResolvedValue(false);
    updateSetting.mockResolvedValue({ data: { id: uid(1) }, error: null });
    expect(await setRemindersEnabled(false)).toMatchObject({ success: true, enabled: false });
    expect(updateSetting).toHaveBeenCalledWith(expect.any(String), false);
  });
});
