import { describe, expect, it } from 'vitest';
import { getDefaultReminderSchedule } from '../reminder-config';
import { DEFAULT_REMINDER_SCHEDULE } from '@/lib/notifications/types';

// SMS is off until the provider is connected (owner decision 2026-10-13).
// Re-enabling means adding 'sms' to IMPLEMENTED_CHANNELS and to both defaults.
describe('default reminder schedules while SMS is off', () => {
  it('DEFAULT_REMINDER_SCHEDULE has email only on every step', () => {
    expect(DEFAULT_REMINDER_SCHEDULE.steps.length).toBeGreaterThan(0);
    for (const step of DEFAULT_REMINDER_SCHEDULE.steps) {
      expect(step.channels).toEqual(['email']);
    }
  });

  it('getDefaultReminderSchedule has email only on every step', async () => {
    const schedule = await getDefaultReminderSchedule();
    expect(schedule.steps.length).toBeGreaterThan(0);
    for (const step of schedule.steps) {
      expect(step.channels).toEqual(['email']);
    }
  });
});
