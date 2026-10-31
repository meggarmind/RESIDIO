import { redirect } from 'next/navigation';

/**
 * Redirect from the old Data Management location to Settings > Data Tools (#1274).
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function DataManagementRedirect() {
  redirect('/settings/data-tools');
}
