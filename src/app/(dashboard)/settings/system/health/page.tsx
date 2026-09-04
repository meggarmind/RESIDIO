import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings location to System.
 * This page rendered only <CronHealthCard>, a subset of the richer canonical
 * cron status UI now at /system/cron-status (issue #174) — the two fetch
 * paths and three surfaces this page duplicated are retired in its favor.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function SystemHealthRedirect() {
  redirect('/system/cron-status');
}
