import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings location to System.
 * Audit logs are something an administrator watches, not something they
 * configure, so the page now lives under /system rather than /settings.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function AuditLogsRedirect() {
  redirect('/system/audit-logs');
}
