import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings System location.
 * Maintenance mode is genuine configuration and stays in Settings (#176,
 * ADR-0004) — it just moved up a level so it no longer sits beside the new
 * top-level /system dashboard, which means something entirely different.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function SettingsSystemMaintenanceRedirect() {
  redirect('/settings/maintenance');
}
