import { redirect } from 'next/navigation';

/**
 * Notification Schedules is hidden (#787): nothing reads `notification_schedules`,
 * so schedules configured here never sent anything. Payment reminders are set in
 * Reminder Schedule. The table and its actions stay until the owner decides on removal.
 */
export default function NotificationSchedulesRedirect() {
  redirect('/settings/notifications');
}
