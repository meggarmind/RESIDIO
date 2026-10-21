import type { ReminderScheduleStep } from '@/lib/notifications/types';

/**
 * The payment reminder settings an admin edits on Settings > Billing (reminder days) and
 * Settings > Email (the Payment Reminders switch). Both the manual run and the daily cron read
 * them here, so a change reaches the reminders residents actually receive (#846).
 *
 * Deliberately NOT a 'use server' module. The caller passes its own reader: the RLS-bound
 * `getSettingValue` from an admin session, `getSettingValueAsService` from the cron.
 */

export const DEFAULT_PAYMENT_REMINDER_DAYS = [7, 3, 1];

export interface PaymentReminderSettings {
  emailEnabled: boolean;
  /** Days before the due date, e.g. [7, 3, 1]. */
  reminderDays: number[];
}

export async function readPaymentReminderSettings(
  read: (key: string) => Promise<unknown>
): Promise<PaymentReminderSettings> {
  const [enabled, daysRaw] = await Promise.all([
    read('email_payment_reminders_enabled'),
    read('payment_reminder_days'),
  ]);
  return {
    emailEnabled: enabled !== false,
    reminderDays: Array.isArray(daysRaw)
      ? daysRaw.map((d) => Number(d)).filter((d) => !isNaN(d))
      : DEFAULT_PAYMENT_REMINDER_DAYS,
  };
}

/**
 * Narrows the automatic reminder schedule to those settings: a step before the due date runs
 * only on a configured reminder day, email is dropped from every step when the switch is off,
 * and a step left with no channel is dropped. Steps on or after the due date keep their timing.
 */
export function applyPaymentReminderSettings(
  steps: ReminderScheduleStep[],
  settings: PaymentReminderSettings
): ReminderScheduleStep[] {
  return steps
    .filter((step) => step.daysFromDue >= 0 || settings.reminderDays.includes(-step.daysFromDue))
    .map((step) =>
      settings.emailEnabled ? step : { ...step, channels: step.channels.filter((c) => c !== 'email') }
    )
    .filter((step) => step.channels.length > 0);
}
