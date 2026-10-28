import { redirect } from 'next/navigation';

/**
 * Data Tools moved to Settings > System (#1274): it changes data, so it is not a monitoring page.
 * Kept as a redirect so bookmarks work; the ROUTE_PERMISSIONS key for this path stays so the stub
 * remains gated (ADR-0004).
 */
export default function SystemDataToolsRedirect() {
  redirect('/settings/data-tools');
}
