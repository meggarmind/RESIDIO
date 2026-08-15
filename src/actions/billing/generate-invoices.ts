'use server';

import { sendInvoiceGenerationAlert } from '@/actions/email/send-admin-alert';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createLogger } from '@/lib/logger';
import type { InvoiceGenerationTrigger as GenerationTrigger } from '@/lib/billing/invoice-generation-history';
import {
    collectInvoiceGenerationRunErrors,
    currentMonthPeriod,
    findReusableInvoiceGenerationRun,
    parseInvoiceGenerationRequest,
    prepareInvoiceGenerationRunCore,
    processInvoiceGenerationRunToCompletion,
} from '@/lib/billing/invoice-generation-run-service';
import { revalidatePath } from 'next/cache';

const log = createLogger('[Billing]');

// Kept as an inline alias (not a re-export) so Turbopack's server-action
// manifest does not treat it as a runtime export of this 'use server' module.
export type InvoiceGenerationTrigger = GenerationTrigger;

interface SkipReason { house: string; reason: string }
interface GenerateInvoicesResult {
  success: boolean;
  generated: number;
  skipped: number;
  skipReasons: SkipReason[];
  errors: string[];
  logId?: string;
  durationMs?: number;
  runId?: string;
}

const monthOf = (date: Date) => currentMonthPeriod(date);

/**
 * Compatibility entry point for existing cron/API/admin callers. It prepares
 * (or reuses) a durable current-month generation run and advances it to a
 * terminal state; all invoice writes flow through the `create_generated_invoice`
 * RPC. Runs are idempotent per (trigger, target month): re-invocations reuse
 * the existing run instead of creating duplicates.
 */
export async function generateMonthlyInvoices(
  upToDate: Date = new Date(),
  triggerType: InvoiceGenerationTrigger = 'manual',
  options?: { debitWallet?: boolean; sendEmails?: boolean },
): Promise<GenerateInvoicesResult> {
  const startedAt = Date.now();
  const period = monthOf(upToDate);
  let actorId: string | null = null;
  if (triggerType === 'manual') {
    const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
    if (!auth.authorized) return { success: false, generated: 0, skipped: 0, skipReasons: [], errors: [auth.error || 'Unauthorized'] };
    actorId = auth.userId;
  }

  const existing = await findReusableInvoiceGenerationRun(triggerType, period);
  let runId: string;
  let skipReasons: SkipReason[] = [];
  if (existing) {
    runId = existing.id;
  } else {
    const request = parseInvoiceGenerationRequest({
      mode: 'selected_month',
      targetMonth: period,
      trigger: triggerType,
      walletAllocation: options?.debitWallet ?? triggerType === 'manual',
      sendEmails: options?.sendEmails ?? triggerType === 'manual',
      assessLateFees: false,
    });
    const prepared = await prepareInvoiceGenerationRunCore(request, actorId);
    if (!prepared.data) {
      return { success: false, generated: 0, skipped: 0, skipReasons: [], errors: [prepared.error || 'Could not create invoice generation run'], durationMs: Date.now() - startedAt };
    }
    runId = prepared.data.id;
    skipReasons = prepared.data.skipReasons;
  }

  const outcome = await processInvoiceGenerationRunToCompletion(runId, actorId);
  const finalRun = outcome.run ?? existing;
  const errors = await collectInvoiceGenerationRunErrors(runId);
  if (outcome.capped) errors.push(`Run ${runId.slice(0, 8)} still has pending work after the chunk budget; it will continue on the next invocation`);
  const summarySkips = finalRun && Array.isArray(finalRun.result_summary?.skips)
    ? (finalRun.result_summary.skips as unknown as SkipReason[]).filter((item) => item && typeof item === 'object')
    : skipReasons;

  const result: GenerateInvoicesResult = {
    success: (finalRun?.status ?? 'queued') !== 'cancelled',
    generated: finalRun?.created_count ?? 0,
    skipped: (finalRun?.skipped_count ?? 0) + summarySkips.length,
    skipReasons: summarySkips,
    errors,
    durationMs: Date.now() - startedAt,
    runId,
  };

  if (triggerType === 'manual' && actorId) {
    await logAudit({ action: 'GENERATE', entityType: 'invoice_generation_run', entityId: runId, entityDisplay: `Invoice Generation - ${result.generated} invoices`, newValues: { generated_count: result.generated, skipped_count: result.skipped, error_count: result.errors.length, target_period: period, status: finalRun?.status }, description: `${triggerType} invoice generation via compatibility wrapper`, metadata: { trigger_type: triggerType, duration_ms: result.durationMs } });
  }
  if (result.errors.length) sendInvoiceGenerationAlert(result.generated, result.skipped, result.errors.length, result.errors, triggerType).catch((error) => log.error('Failed to send invoice generation alert', error));
  revalidatePath('/billing');
  return result;
}
