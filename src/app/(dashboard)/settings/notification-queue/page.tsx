import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings location to System.
 * The notification queue shows live system state (messages waiting to be
 * sent), not configuration, so the page now lives under /system rather than
 * /settings. See ADR-0004.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function NotificationQueueRedirect() {
  redirect('/system/notification-queue');
}
