import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings System location. Data retention and Prune Data live on
 * /settings/system (#938). The ROUTE_PERMISSIONS entry for this path stays: it still decides who
 * reaches the redirect (ADR-0004).
 */
export default function SettingsSystemDataRedirect() {
  redirect('/settings/system#retention');
}
