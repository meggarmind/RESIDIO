'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { InvoiceGenerationTrigger as GenerationTrigger } from '@/lib/billing/invoice-generation-history';
import {
    runMonthlyInvoiceGeneration,
    type GenerateInvoicesResult,
} from '@/lib/billing/generate-monthly-invoices';

// Kept as an inline alias (not a re-export) so Turbopack's server-action
// manifest does not treat it as a runtime export of this 'use server' module.
export type InvoiceGenerationTrigger = GenerationTrigger;

/**
 * Generate the current month's invoices (admin UI / admin API entry point).
 * Always requires BILLING_CREATE_INVOICE; there is intentionally no trigger
 * parameter (#470). Cron/API callers use `runMonthlyInvoiceGeneration` from
 * '@/lib/billing/generate-monthly-invoices' after authenticating the request.
 */
export async function generateMonthlyInvoices(
  upToDate: Date = new Date(),
  options?: { debitWallet?: boolean; sendEmails?: boolean },
): Promise<GenerateInvoicesResult> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_CREATE_INVOICE);
  if (!auth.authorized) return { success: false, generated: 0, skipped: 0, skipReasons: [], errors: [auth.error || 'Unauthorized'] };
  return runMonthlyInvoiceGeneration(upToDate, 'manual', auth.userId, options);
}
