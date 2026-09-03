import { redirect } from 'next/navigation';

/**
 * Redirect from the retired Settings System overview.
 * This page was only a pair of link-cards to Maintenance and Data & Retention
 * (#174 already removed its cron section), and those two pages have since
 * moved to /settings/maintenance and /settings/data-retention directly
 * (#176) — they no longer share a "/settings/system" parent, so there is no
 * single successor for this overview to become. It sends visitors to the
 * Settings landing page rather than to /system, which does not exist yet
 * (#177 creates the new System dashboard).
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function SettingsSystemOverviewRedirect() {
  redirect('/settings');
}
