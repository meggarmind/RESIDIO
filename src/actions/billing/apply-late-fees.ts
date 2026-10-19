'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  runLateFeeApplication,
  previewLateFeeApplication,
  type ApplyLateFeesResult,
  type LateFeePreview,
} from '@/lib/billing/apply-late-fees';
import type { LateFeeLog } from '@/types/database';

/**
 * Apply late fees to overdue invoices (admin UI entry point).
 * Always requires BILLING_APPLY_LATE_FEES. The cron route does not call this;
 * it calls `runLateFeeApplication` from '@/lib/billing/apply-late-fees' after
 * `verifyCronAuth`. There is intentionally no trigger parameter (#470).
 */
export async function applyLateFees(): Promise<ApplyLateFeesResult> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_APPLY_LATE_FEES);
  if (!auth.authorized) {
    return {
      success: false,
      processed: 0,
      applied: 0,
      totalLateFees: 0,
      skippedWaiver: 0,
      skippedAlreadyApplied: 0,
      errors: [auth.error || 'Unauthorized'],
    };
  }
  return runLateFeeApplication('manual', auth.userId);
}

/**
 * Dry run of `applyLateFees` for the confirmation dialog (#790): counts and the naira
 * total it would add, read-only. Same permission as the write it previews.
 */
export async function previewLateFees(): Promise<{ data: LateFeePreview | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_APPLY_LATE_FEES);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  return previewLateFeeApplication();
}

// Get late fee application history
export async function getLateFeeHistory(params: {
  page?: number;
  limit?: number;
}): Promise<{
  data: LateFeeLog[] | null;
  total: number;
  error: string | null;
}> {
  const { page = 1, limit = 20 } = params;

  const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
  if (!auth.authorized) {
    return { data: null, total: 0, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('late_fee_log')
    .select('*', { count: 'exact' })
    .order('run_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { data: null, total: 0, error: error.message };
  }

  return {
    data: data as LateFeeLog[],
    total: count || 0,
    error: null,
  };
}

// Get late fee settings
export async function getLateFeeSettings(): Promise<{
  enabled: boolean;
  type: 'percentage' | 'fixed';
  amount: number;
  gracePeriodDays: number;
  autoApply: boolean;
  applicationDay: number;
}> {
  const enabled = (await getSettingValueAsService('late_fee_enabled')) === true;
  const type = ((await getSettingValueAsService('late_fee_type')) as string) || 'percentage';
  const amount = Number(await getSettingValueAsService('late_fee_amount')) || 5;
  const gracePeriodDays = Number(await getSettingValueAsService('grace_period_days')) || 7;
  const autoApply = (await getSettingValueAsService('late_fee_auto_apply')) === true;
  const applicationDay = Number(await getSettingValueAsService('late_fee_application_day')) || 5;

  return {
    enabled,
    type: type as 'percentage' | 'fixed',
    amount,
    gracePeriodDays,
    autoApply,
    applicationDay,
  };
}
