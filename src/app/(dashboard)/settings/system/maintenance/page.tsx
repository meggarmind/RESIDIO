import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings System location. Maintenance mode lives on
 * /settings/system (#938). The ROUTE_PERMISSIONS entry for this path stays: it still decides who
 * reaches the redirect (ADR-0004).
 */
export default function SettingsSystemMaintenanceRedirect() {
  redirect('/settings/system#maintenance-mode');
}
