'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ReportSubscription } from '@/types/database';

/**
 * Get report subscription settings for the current user
 */
export async function getMyReportSubscription(): Promise<{
  data: ReportSubscription | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from('report_subscriptions')
    .select('*')
    .eq('resident_id', resident.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching report subscription:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Get report subscription for a specific resident (admin use)
 */
export async function getReportSubscription(residentId: string): Promise<{
  data: ReportSubscription | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('report_subscriptions')
    .select('*')
    .eq('resident_id', residentId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching report subscription:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
