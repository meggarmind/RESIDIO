export type RenewalReminderSetting = {
  key: string;
  value: string | null;
};

export type RenewalReminderConfig = {
  reminderDays: number;
  reminderSent: boolean;
};

const DEFAULT_REMINDER_DAYS = 3;

/** Resolve both reminder values from one system-settings snapshot. */
export function getRenewalReminderConfig(
  settings: RenewalReminderSetting[],
  codeId: string,
): RenewalReminderConfig {
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const configuredDays = Number.parseInt(byKey.get(`access_code_reminder_${codeId}`) ?? '', 10);

  return {
    reminderDays: Number.isFinite(configuredDays) && configuredDays >= 0
      ? configuredDays
      : DEFAULT_REMINDER_DAYS,
    reminderSent: byKey.get(`access_code_reminder_sent_${codeId}`) === 'true',
  };
}
