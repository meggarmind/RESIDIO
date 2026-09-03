import { redirect } from 'next/navigation';

/**
 * Redirect from the deprecated Settings location to System.
 * Data management tools (like the ownership backfill) are administrative utilities,
 * not settings to configure, so the page now lives under /system rather than /settings.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function DataManagementRedirect() {
  redirect('/system/data-tools');
}
