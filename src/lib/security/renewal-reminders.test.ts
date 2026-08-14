import { describe, expect, it } from 'vitest';
import { getRenewalReminderConfig } from '@/lib/security/renewal-reminders';

describe('getRenewalReminderConfig', () => {
  it('resolves reminder days and sent state from one settings snapshot', () => {
    expect(getRenewalReminderConfig([
      { key: 'access_code_reminder_code-1', value: '5' },
      { key: 'access_code_reminder_sent_code-1', value: 'true' },
    ], 'code-1')).toEqual({ reminderDays: 5, reminderSent: true });
  });

  it('uses the safe default for invalid or missing reminder days', () => {
    expect(getRenewalReminderConfig([], 'code-1')).toEqual({ reminderDays: 3, reminderSent: false });
    expect(getRenewalReminderConfig([
      { key: 'access_code_reminder_code-1', value: '-2' },
    ], 'code-1').reminderDays).toBe(3);
  });
});
