import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addReminderStep } from '../reminder-config';
import { DEFAULT_REMINDER_SCHEDULE } from '@/lib/notifications/types';

const { authorizePermission, logAudit, updateSetting, getSettingValueAsService } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  updateSetting: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting }));

const step = { daysFromDue: 2, escalationLevel: 'warning' as const, channels: ['whatsapp' as const], isActive: true, priority: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  authorizePermission.mockResolvedValue({ authorized: true });
  getSettingValueAsService.mockResolvedValue(null); // no stored row: the default schedule is loaded
});

describe('adding a reminder step when no schedule row exists (#903)', () => {
  it('saves the new step and asks updateSetting to create the row', async () => {
    updateSetting.mockResolvedValue({ data: { id: 'row-1' }, error: null });
    expect(await addReminderStep(step)).toEqual({ success: true });
    const [key, json, createIfMissing] = updateSetting.mock.calls[0];
    expect(key).toBe('invoice_reminder_schedule');
    expect(createIfMissing).toMatchObject({ category: 'notifications' });
    expect(JSON.parse(json).steps.some((s: { channels: string[] }) => s.channels.includes('whatsapp'))).toBe(true);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('returns the save error instead of reporting success', async () => {
    updateSetting.mockResolvedValue({ data: null, error: 'Failed to update setting' });
    expect(await addReminderStep(step)).toEqual({ success: false, error: 'Failed to update setting' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses without permission and writes nothing', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    expect(await addReminderStep(step)).toEqual({ success: false, error: 'Forbidden' });
    expect(updateSetting).not.toHaveBeenCalled();
  });
});

describe('seed migration', () => {
  it('holds the same steps as DEFAULT_REMINDER_SCHEDULE', () => {
    const sql = readFileSync('supabase/migrations/20261022130000_seed_invoice_reminder_schedule.sql', 'utf8');
    const seeded = JSON.parse(/'(\{[\s\S]*\})'::jsonb/.exec(sql)![1]);
    expect(seeded.steps).toEqual(DEFAULT_REMINDER_SCHEDULE.steps);
  });
});
