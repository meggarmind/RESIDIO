import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkPermission } from '@/lib/auth/check-permission';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { AnnouncementAnalyticsClient } from './analytics-client';

/**
 * Announcement Analytics Dashboard Page
 *
 * Server component that handles RBAC before rendering the client dashboard.
 * Requires ANNOUNCEMENTS_VIEW permission.
 */
export default async function AnnouncementAnalyticsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users
  if (!user) {
    redirect('/login');
  }

  // Check permission
  const hasPermission = await checkPermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!hasPermission) {
    redirect('/dashboard?error=unauthorized');
  }

  return <AnnouncementAnalyticsClient />;
}
