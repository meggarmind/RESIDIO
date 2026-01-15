'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { getSettingValue } from '@/actions/settings/get-settings';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { LateFeeLog } from '@/types/database';

type ApplyLateFeesResult = {
  success: boolean;
  processed: number;
  applied: number;
  totalLateFees: number;
  skippedWaiver: number;
  skippedAlreadyApplied: number;
  errors: string[];
  logId?: string;
  durationMs?: number;
};

type TriggerType = 'manual' | 'cron' | 'api';

/**
 * Apply late fees to overdue invoices
 * Supports both manual trigger (requires auth) and cron trigger (uses admin client)
 */
export async function applyLateFees(
  triggerType: TriggerType = 'manual'
): Promise<ApplyLateFeesResult> {
  const startTime = Date.now();
  let userId: string | null = null;

  // For manual triggers, check authorization
  if (triggerType === 'manual') {
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
    userId = auth.userId;
  }

  // Use admin client for cron/api triggers, server client for manual
  const supabase =
    triggerType === 'manual'
      ? await createServerSupabaseClient()
      : createAdminClient();

  // Get late fee settings
  const lateFeeEnabled = await getSettingValue('late_fee_enabled');
  if (!lateFeeEnabled) {
    return {
      success: false,
      processed: 0,
      applied: 0,
      totalLateFees: 0,
      skippedWaiver: 0,
      skippedAlreadyApplied: 0,
      errors: ['Late fees are not enabled'],
    };
  }

  const lateFeeType = ((await getSettingValue('late_fee_type')) as string) || 'percentage';
  const lateFeeAmount = Number(await getSettingValue('late_fee_amount')) || 5;
  const gracePeriodDays = Number(await getSettingValue('grace_period_days')) || 7;

  // Calculate the cutoff date (invoices due before this date are eligible for late fees)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  // Get pending waivers to exclude those invoices
  const { data: pendingWaivers } = await supabase
    .from('late_fee_waivers')
    .select('invoice_id')
    .eq('status', 'pending');

  const pendingWaiverInvoiceIds = new Set(pendingWaivers?.map((w: { invoice_id: string }) => w.invoice_id) || []);

  // Find overdue invoices that haven't had late fees applied yet
  const { data: overdueInvoices, error: fetchError } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount_due, due_date, status, metadata')
    .in('status', ['unpaid', 'partially_paid'])
    .lt('due_date', cutoffDateStr)
    .order('due_date', { ascending: true });

  if (fetchError) {
    return {
      success: false,
      processed: 0,
      applied: 0,
      totalLateFees: 0,
      skippedWaiver: 0,
      skippedAlreadyApplied: 0,
      errors: [fetchError.message],
    };
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    // Log the run even if no invoices processed
    const logResult = await logLateFeeRun({
      triggerType,
      triggeredBy: userId,
      invoicesProcessed: 0,
      feesApplied: 0,
      totalFeesAmount: 0,
      invoicesSkippedWaiver: 0,
      invoicesSkippedAlreadyApplied: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      processed: 0,
      applied: 0,
      totalLateFees: 0,
      skippedWaiver: 0,
      skippedAlreadyApplied: 0,
      errors: [],
      logId: logResult.logId,
      durationMs: Date.now() - startTime,
    };
  }

  const errors: string[] = [];
  let applied = 0;
  let totalLateFees = 0;
  let skippedWaiver = 0;
  let skippedAlreadyApplied = 0;

  for (const invoice of overdueInvoices) {
    const metadata = (invoice.metadata as Record<string, unknown>) || {};

    // Skip if late fee already applied
    if (metadata.late_fee_applied) {
      skippedAlreadyApplied++;
      continue;
    }

    // Skip if there's a pending waiver request
    if (pendingWaiverInvoiceIds.has(invoice.id)) {
      skippedWaiver++;
      continue;
    }

    // Calculate late fee
    let lateFee: number;
    if (lateFeeType === 'percentage') {
      lateFee = Math.round((invoice.amount_due * lateFeeAmount) / 100 * 100) / 100;
    } else {
      lateFee = lateFeeAmount;
    }

    // Update invoice with late fee
    const newTotal = invoice.amount_due + lateFee;
    const newMetadata = {
      ...metadata,
      late_fee_applied: true,
      late_fee_amount: lateFee,
      late_fee_applied_at: new Date().toISOString(),
      late_fee_type: lateFeeType,
      late_fee_rate: lateFeeAmount,
      original_amount: invoice.amount_due,
    };

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        amount_due: newTotal,
        metadata: newMetadata,
      })
      .eq('id', invoice.id);

    if (updateError) {
      errors.push(`Failed to apply late fee to invoice ${invoice.invoice_number}: ${updateError.message}`);
      continue;
    }

    // Add late fee as an invoice item
    const { error: itemError } = await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      name: `Late Fee (${lateFeeType === 'percentage' ? `${lateFeeAmount}%` : 'Fixed'})`,
      description: `Late payment penalty applied on ${new Date().toLocaleDateString()}`,
      amount: lateFee,
      quantity: 1,
    });

    if (itemError) {
      errors.push(`Failed to add late fee item to invoice ${invoice.invoice_number}: ${itemError.message}`);
    }

    applied++;
    totalLateFees += lateFee;

    // Log audit (only for manual triggers where we have user context)
    if (triggerType === 'manual') {
      await logAudit({
        action: 'UPDATE',
        entityType: 'invoices',
        entityId: invoice.id,
        entityDisplay: invoice.invoice_number,
        oldValues: { amount_due: invoice.amount_due, late_fee_applied: false },
        newValues: { amount_due: newTotal, late_fee_applied: true, late_fee_amount: lateFee },
      });
    }
  }

  const durationMs = Date.now() - startTime;

  // Log the run
  const logResult = await logLateFeeRun({
    triggerType,
    triggeredBy: userId,
    invoicesProcessed: overdueInvoices.length,
    feesApplied: applied,
    totalFeesAmount: totalLateFees,
    invoicesSkippedWaiver: skippedWaiver,
    invoicesSkippedAlreadyApplied: skippedAlreadyApplied,
    errors,
    durationMs,
  });

  return {
    success: true,
    processed: overdueInvoices.length,
    applied,
    totalLateFees,
    skippedWaiver,
    skippedAlreadyApplied,
    errors,
    logId: logResult.logId,
    durationMs,
  };
}

// Helper to log late fee application run
async function logLateFeeRun(params: {
  triggerType: TriggerType;
  triggeredBy: string | null;
  invoicesProcessed: number;
  feesApplied: number;
  totalFeesAmount: number;
  invoicesSkippedWaiver: number;
  invoicesSkippedAlreadyApplied: number;
  errors: string[];
  durationMs: number;
}): Promise<{ logId?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('late_fee_log')
    .insert({
      trigger_type: params.triggerType,
      triggered_by: params.triggeredBy,
      invoices_processed: params.invoicesProcessed,
      fees_applied: params.feesApplied,
      total_fees_amount: params.totalFeesAmount,
      invoices_skipped_waiver: params.invoicesSkippedWaiver,
      invoices_skipped_already_applied: params.invoicesSkippedAlreadyApplied,
      errors: params.errors,
      duration_ms: params.durationMs,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log late fee run:', error);
    return {};
  }

  return { logId: data?.id };
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
  const enabled = (await getSettingValue('late_fee_enabled')) === true;
  const type = ((await getSettingValue('late_fee_type')) as string) || 'percentage';
  const amount = Number(await getSettingValue('late_fee_amount')) || 5;
  const gracePeriodDays = Number(await getSettingValue('grace_period_days')) || 7;
  const autoApply = (await getSettingValue('late_fee_auto_apply')) === true;
  const applicationDay = Number(await getSettingValue('late_fee_application_day')) || 5;

  return {
    enabled,
    type: type as 'percentage' | 'fixed',
    amount,
    gracePeriodDays,
    autoApply,
    applicationDay,
  };
}
