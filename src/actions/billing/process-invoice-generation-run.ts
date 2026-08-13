'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';

export async function processInvoiceGenerationRun(runId: string) {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  try {
    const data = await processInvoiceGenerationRunChunk(runId, auth.userId);
    await logAudit({ action: 'GENERATE', entityType: 'invoice_generation_run', entityId: runId, entityDisplay: `Invoice generation run ${runId.slice(0, 8)}`, newValues: { processed: data.processed }, description: 'Processed invoice generation run chunk' });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Could not process invoice generation run' };
  }
}
