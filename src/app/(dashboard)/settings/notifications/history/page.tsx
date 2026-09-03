import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings location to System.
 * Sent-notification history is historical system state, not configuration,
 * so the page now lives under /system rather than /settings. See ADR-0004.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function NotificationHistoryRedirect() {
  redirect('/system/notification-history');
}
