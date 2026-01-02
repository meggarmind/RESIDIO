import { redirect } from 'next/navigation';

/**
 * Redirect from deprecated User Role Assignments page to Roles & Permissions.
 * The Role Assignments tab in Roles & Permissions provides the same functionality.
 *
 * This permanent redirect ensures bookmarks and external links continue to work.
 */
export default function UserRolesRedirect() {
  redirect('/settings/roles?tab=assignments');
}
