import { redirect } from 'next/navigation';

/**
 * Redirect from deprecated User Role Assignments page to the System Accounts page.
 * Role Assignments moved out of Settings and into /system/accounts (see ADR-0004:
 * Settings is configuration-only, day-to-day account work lives under System).
 * The `tab=assignments` query string still matches a real tab at the new
 * destination, so it is kept rather than dropped.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function UserRolesRedirect() {
  redirect('/system/accounts?tab=assignments');
}
