/**
 * Queue an import's transactions for admin review (service-role library, NOT a server action)
 *
 * The scheduled fetch-emails run ends here instead of processEmailTransactions: it posts no
 * payment, expense or petty-cash entry. Money is written only when an admin processes a queued
 * transaction through the permission-gated review actions (owner decision on #879).
 *
 * Deliberately has no server-action directive and no auth: it uses the service-role client and
 * is only called by the CRON_SECRET cron route. Exporting it from a server-action file would
 * make it a public endpoint (#561).
 */

import { createAdminClient } from '@/lib/supabase/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { writeEmailImportStatus } from '@/lib/email-imports/import-records';

export async function queueEmailTransactionsForReview(
  importId: string
): Promise<{ queuedForReview: number; error: string | null }> {
  const adminClient = await createAdminClient();

  const { data: queued, error } = await adminClient
    .from('email_transactions')
    .update({ status: 'queued_for_review' })
    .eq('email_import_id', importId)
    .in('status', ['pending', 'matched'])
    .select('id');

  if (error) {
    await writeEmailImportStatus(adminClient, {
      importId,
      status: 'failed',
      errorMessage: error.message,
    });
    return { queuedForReview: 0, error: error.message };
  }

  const queuedForReview = queued?.length ?? 0;

  await writeEmailImportStatus(adminClient, {
    importId,
    status: 'completed',
    transactionsAutoProcessed: 0,
    transactionsQueued: queuedForReview,
  });

  if (queuedForReview > 0) {
    await notifyAdmins({
      title: 'Email Transactions Queued',
      body: `${queuedForReview} transactions from import ${importId.slice(0, 8)} require manual review.`,
      category: 'payment',
      actionUrl: `/payments/email-imports/${importId}`,
      priority: 'normal',
      requiredPermission: PERMISSIONS.EMAIL_IMPORTS_PROCESS,
    });
  }

  return { queuedForReview, error: null };
}
