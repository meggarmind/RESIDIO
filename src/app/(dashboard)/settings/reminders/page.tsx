'use client';

import { RemindersOnOffSection } from '@/components/settings/messages/reminders-on-off-section';
import { ReminderScheduleSection } from '@/components/settings/messages/reminder-schedule-section';
import { SendRemindersNowSection } from '@/components/settings/messages/send-reminders-test-section';
import { useReminderSettings } from '@/components/settings/messages/use-reminder-settings';
import { SettingsMergedPage } from '@/components/settings/settings-merged-page';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { useAuth } from '@/lib/auth/auth-provider';

export default function RemindersPage() {
  const { hasPermission } = useAuth();
  const reminders = useReminderSettings(hasPermission(PERMISSIONS.NOTIFICATIONS_MANAGE));

  return (
    <SettingsMergedPage>
      <RemindersOnOffSection {...reminders} />
      <ReminderScheduleSection schedule={reminders.schedule} loading={reminders.loading} reload={reminders.reload} />
      <SendRemindersNowSection />
    </SettingsMergedPage>
  );
}
