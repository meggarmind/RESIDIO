import { redirect } from 'next/navigation';

/**
 * Redirect from deprecated User Role Assignments page to Roles & Access, which
 * lives at /settings/access (#939, ADR-0004 amendment: role work is configuration).
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function UserRolesRedirect() {
  redirect('/settings/access?tab=administrators');
}
