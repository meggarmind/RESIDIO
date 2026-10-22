import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { logAudit } from '@/lib/audit/logger';

export type ApplyLateFeesResult = {
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

export type LateFeeTriggerType = 'manual' | 'cron' | 'api';

export type LateFeePreview = {
  enabled: boolean;
  gracePeriodDays: number;
  lateFeeType: string;
  lateFeeRate: number;
  eligible: number;
  totalLateFees: number;
  skippedWaiver: number;
  skippedAlreadyApplied: number;
};

export function calculateLateFee(amountDue: number, lateFeeType: string, lateFeeAmount: number): number {
  if (lateFeeType === 'percentage') {
    return Math.round((amountDue * lateFeeAmount) / 100 * 100) / 100;
  }
  return lateFeeAmount;
}

// The late-fee invoice item is the record that a fee was applied (#806). It is identified by
// invoice_items.late_fee_applied_at, set only by the run (#830); the description is a display label
// and admins can type the same text on their own lines.
export const LATE_FEE_ITEM_DESCRIPTION = 'Late Fee (auto)';

export type InvoiceItemRef = { amount: number; late_fee_applied_at: string | null };

/** The invoice's late-fee item, if a late fee has been applied to it. */
export function findLateFeeItem(items: InvoiceItemRef[] | null | undefined): InvoiceItemRef | undefined {
  return items?.find((item) => !!item.late_fee_applied_at);
}

/**
 * What `runLateFeeApplication` would do right now, without writing anything (#790).
 * Mirrors its settings reads, invoice query and skip rules.
 */
export function planLateFees(
  invoices: { id: string; amount_due: number; invoice_items: InvoiceItemRef[] | null }[],
  pendingWaiverInvoiceIds: Set<string>,
  lateFeeType: string,
  lateFeeAmount: number
): Pick<LateFeePreview, 'eligible' | 'totalLateFees' | 'skippedWaiver' | 'skippedAlreadyApplied'> {
  const plan = { eligible: 0, totalLateFees: 0, skippedWaiver: 0, skippedAlreadyApplied: 0 };
  for (const invoice of invoices) {
    if (findLateFeeItem(invoice.invoice_items)) {
      plan.skippedAlreadyApplied++;
    } else if (pendingWaiverInvoiceIds.has(invoice.id)) {
      plan.skippedWaiver++;
    } else {
      plan.eligible++;
      plan.totalLateFees += calculateLateFee(invoice.amount_due, lateFeeType, lateFeeAmount);
    }
  }
  plan.totalLateFees = Math.round(plan.totalLateFees * 100) / 100;
  return plan;
}

/** Read-only dry run of a manual application; the caller checks the permission. */
export async function previewLateFeeApplication(): Promise<{ data: LateFeePreview | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const enabled = !!(await getSettingValueAsService('late_fee_enabled'));
  const lateFeeType = ((await getSettingValueAsService('late_fee_type')) as string) || 'percentage';
  const lateFeeRate = Number(await getSettingValueAsService('late_fee_amount')) || 5;
  const gracePeriodDays = Number(await getSettingValueAsService('grace_period_days')) || 7;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const { data: pendingWaivers, error: waiverError } = await supabase
    .from('late_fee_waivers')
    .select('invoice_id')
    .eq('status', 'pending');
  if (waiverError) return { data: null, error: waiverError.message };

  const { data: overdueInvoices, error } = await supabase
    .from('invoices')
    .select('id, amount_due, invoice_items(amount, late_fee_applied_at)')
    .in('status', ['unpaid', 'partially_paid'])
    .lt('due_date', cutoffDateStr);
  if (error) return { data: null, error: error.message };

  const pendingIds = new Set((pendingWaivers || []).map((w: { invoice_id: string }) => w.invoice_id));
  const plan = planLateFees(overdueInvoices || [], pendingIds, lateFeeType, lateFeeRate);
  return { data: { enabled, gracePeriodDays, lateFeeType, lateFeeRate, ...plan }, error: null };
}

/**
 * Apply late fees to overdue invoices.
 *
 * NOT a server action: this module deliberately has no 'use server' so it is
 * never registered as a client-callable endpoint (#470). The trigger is chosen
 * by trusted server code only:
 *   - 'manual': called by the permission-guarded `applyLateFees` action, which
 *     passes the authorised user id; runs on the user-scoped client.
 *   - 'cron' / 'api': called by routes AFTER they have authenticated the request
 *     (e.g. `verifyCronAuth`); runs on the service-role client.
 */
export async function runLateFeeApplication(
  triggerType: LateFeeTriggerType,
  userId: string | null = null
): Promise<ApplyLateFeesResult> {
  const startTime = Date.now();

  // Use admin client for cron/api triggers, server client for manual
  const supabase =
    triggerType === 'manual'
      ? await createServerSupabaseClient()
      : createAdminClient();

  // Get late fee settings. Reads via the service-role client (see #136/#139):
  // this function runs from the unauthenticated cron route (as well as the
  // authenticated manual trigger), and the RLS-bound `getSettingValue` always
  // returns null with no authenticated user -- so grace period, rate, and
  // cap would silently fall back to compiled-in defaults under cron
  // regardless of what the estate configured.
  const lateFeeEnabled = await getSettingValueAsService('late_fee_enabled');
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

  const lateFeeType = ((await getSettingValueAsService('late_fee_type')) as string) || 'percentage';
  const lateFeeAmount = Number(await getSettingValueAsService('late_fee_amount')) || 5;
  const gracePeriodDays = Number(await getSettingValueAsService('grace_period_days')) || 7;

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
    .select('id, invoice_number, amount_due, due_date, status, invoice_items(amount, late_fee_applied_at)')
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
    // Skip if late fee already applied
    if (findLateFeeItem(invoice.invoice_items)) {
      skippedAlreadyApplied++;
      continue;
    }

    // Skip if there's a pending waiver request
    if (pendingWaiverInvoiceIds.has(invoice.id)) {
      skippedWaiver++;
      continue;
    }

    const lateFee = calculateLateFee(invoice.amount_due, lateFeeType, lateFeeAmount);

    // Add the late fee item first: it is the applied marker, so a failed amount update
    // below must remove it rather than leave the fee recorded but uncharged.
    const { data: item, error: itemError } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoice.id,
        description: LATE_FEE_ITEM_DESCRIPTION,
        amount: lateFee,
        late_fee_applied_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // 23505: another run stamped this invoice first (unique index, #1057), so it is already applied.
    if (itemError?.code === '23505') {
      skippedAlreadyApplied++;
      continue;
    }

    if (itemError || !item) {
      errors.push(`Failed to add late fee item to invoice ${invoice.invoice_number}: ${itemError?.message ?? 'no row returned'}`);
      continue;
    }

    const newTotal = invoice.amount_due + lateFee;
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ amount_due: newTotal })
      .eq('id', invoice.id);

    if (updateError) {
      const { error: removeError } = await supabase.from('invoice_items').delete().eq('id', item.id);
      if (removeError) {
        console.error(`Late fee item ${item.id} left on uncharged invoice ${invoice.invoice_number}:`, removeError);
      }
      errors.push(`Failed to apply late fee to invoice ${invoice.invoice_number}: ${updateError.message}`);
      continue;
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
  triggerType: LateFeeTriggerType;
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
