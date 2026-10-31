import { redirect } from 'next/navigation';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { AnnouncementAnalyticsClient } from './analytics-client';

/**
 * Announcement Analytics Dashboard Page
 *
 * Server component that handles RBAC before rendering the client dashboard.
 * Requires ANNOUNCEMENTS_VIEW permission.
 */
export default async function AnnouncementAnalyticsPage() {
  // Check permission (also handles auth check)
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);

  if (!auth.authorized) {
    if (!auth.userId) {
      redirect('/login');
    }
    redirect('/dashboard?error=unauthorized');
  }

  return <AnnouncementAnalyticsClient />;
}
