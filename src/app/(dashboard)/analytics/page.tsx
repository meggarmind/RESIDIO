import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AnalyticsPageClient } from './analytics-page-client';

/**
 * Analytics Dashboard Page
 *
 * Server component that handles RBAC before rendering the client dashboard.
 * Restricted to: admin, chairman, financial_secretary
 */
export default async function AnalyticsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users
  if (!user) {
    redirect('/login');
  }

  // Get user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Only allow admin, chairman, financial_secretary
  const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
  if (!profile || !allowedRoles.includes(profile.role || '')) {
    redirect('/dashboard?error=unauthorized');
  }

  return <AnalyticsPageClient />;
}
