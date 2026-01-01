'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { ReportSubscription } from '@/types/database';

export interface ReportSubscriptionUpdateInput {
  receive_monthly_summary?: boolean;
  receive_quarterly_report?: boolean;
  receive_payment_confirmation?: boolean;
  receive_invoice_reminder?: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
  preferred_day_of_month?: number;
}

/**
 * Update or create report subscription for current user
 */
export async function updateMyReportSubscription(
  input: ReportSubscriptionUpdateInput
): Promise<{
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
    return { data: null, error: 'Resident not found' };
  }

  // Validate preferred_day_of_month
  if (input.preferred_day_of_month !== undefined) {
    if (input.preferred_day_of_month < 1 || input.preferred_day_of_month > 28) {
      return { data: null, error: 'Preferred day must be between 1 and 28' };
    }
  }

  // Check if subscription exists
  const { data: existing } = await supabase
    .from('report_subscriptions')
    .select('id')
    .eq('resident_id', resident.id)
    .maybeSingle();

  if (existing) {
    // Update existing subscription
    const { data, error } = await supabase
      .from('report_subscriptions')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('resident_id', resident.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating report subscription:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } else {
    // Create new subscription with defaults
    const { data, error } = await supabase
      .from('report_subscriptions')
      .insert({
        resident_id: resident.id,
        receive_monthly_summary: input.receive_monthly_summary ?? false,
        receive_quarterly_report: input.receive_quarterly_report ?? false,
        receive_payment_confirmation: input.receive_payment_confirmation ?? true,
        receive_invoice_reminder: input.receive_invoice_reminder ?? true,
        email_enabled: input.email_enabled ?? true,
        push_enabled: input.push_enabled ?? true,
        preferred_day_of_month: input.preferred_day_of_month ?? 1,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating report subscription:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  }
}

/**
 * Create default report subscription for a resident
 * Called when resident is created or first accesses subscription settings
 */
export async function createDefaultReportSubscription(residentId: string): Promise<{
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

  // Check if subscription already exists
  const { data: existing } = await supabase
    .from('report_subscriptions')
    .select('id')
    .eq('resident_id', residentId)
    .maybeSingle();

  if (existing) {
    // Return existing subscription
    const { data } = await supabase
      .from('report_subscriptions')
      .select('*')
      .eq('resident_id', residentId)
      .single();

    return { data, error: null };
  }

  // Create with defaults
  const { data, error } = await supabase
    .from('report_subscriptions')
    .insert({
      resident_id: residentId,
      receive_monthly_summary: false,
      receive_quarterly_report: false,
      receive_payment_confirmation: true,
      receive_invoice_reminder: true,
      email_enabled: true,
      push_enabled: true,
      preferred_day_of_month: 1,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating default report subscription:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Admin: Update subscription for a specific resident
 * Requires report_subscriptions.manage permission
 */
export async function adminUpdateReportSubscription(
  residentId: string,
  input: ReportSubscriptionUpdateInput
): Promise<{
  data: ReportSubscription | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.REPORT_SUBSCRIPTIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Validate preferred_day_of_month
  if (input.preferred_day_of_month !== undefined) {
    if (input.preferred_day_of_month < 1 || input.preferred_day_of_month > 28) {
      return { data: null, error: 'Preferred day must be between 1 and 28' };
    }
  }

  // Check if subscription exists
  const { data: existing } = await supabase
    .from('report_subscriptions')
    .select('id')
    .eq('resident_id', residentId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('report_subscriptions')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('resident_id', residentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating report subscription:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } else {
    const { data, error } = await supabase
      .from('report_subscriptions')
      .insert({
        resident_id: residentId,
        ...input,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating report subscription:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  }
}
