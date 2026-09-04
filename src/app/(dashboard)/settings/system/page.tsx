import { redirect } from 'next/navigation';

/**
 * Redirect from the retired Settings System overview.
 *
 * This page used to be a pair of link-cards to Maintenance and Data &
 * Retention (#174 already removed its cron section), and those two pages
 * have since moved to /settings/maintenance and /settings/data-retention
 * directly (#176) — they no longer share a "/settings/system" parent, so
 * there is no content-identical successor.
 *
 * It now sends visitors to /system (#177) rather than to the generic
 * Settings landing page: someone who bookmarked "the system overview" was
 * looking for exactly what /system now provides — an at-a-glance read on
 * cron health, the notification queue, audit activity and account
 * approvals — even though the specific cards changed. /system carries the
 * same route guard (SYSTEM_VIEW_ALL_SETTINGS) this stub already used, so the
 * redirect never sends a visitor somewhere they were not already authorized
 * to land.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function SettingsSystemOverviewRedirect() {
  redirect('/system');
}
