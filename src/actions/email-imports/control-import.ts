'use server';

/**
 * Email Import Control Actions
 *
 * Allows users to manually intervene in email import processes (cancel, retry).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { updateEmailImportStatus, getEmailImport } from './create-email-import';
import { parseAllPendingEmails } from './parse-email';
import { matchEmailTransactions, processEmailTransactions } from './process-email-import';

// ============================================================
// Cancel Import
// ============================================================

export async function cancelImport(importId: string): Promise<{ success: boolean; error?: string }> {
    // Check permissions (same as trigger)
    const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_TRIGGER);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const { data: importData, error: fetchError } = await getEmailImport(importId);
    if (fetchError || !importData) {
        return { success: false, error: 'Import not found' };
    }

    // Only allow canceling running imports
    const runningStatuses = ['fetching', 'parsing', 'matching', 'processing'];
    if (!runningStatuses.includes(importData.status)) {
        return { success: false, error: `Cannot cancel import in '${importData.status}' status` };
    }

    // Update status to failed (with cancelled message)
    const result = await updateEmailImportStatus({
        importId,
        status: 'failed',
        errorMessage: 'Cancelled by user',
    });

    if (result.error) {
        return { success: false, error: result.error };
    }

    // Audit log
    await logAudit({
        action: 'UPDATE',
        entityType: 'email_imports',
        entityId: importId,
        entityDisplay: 'Import Cancelled',
        newValues: { status: 'failed', error_message: 'Cancelled by user' },
    });

    return { success: true };
}

// ============================================================
// Retry Import Processing
// ============================================================

export async function retryImportProcessing(importId: string): Promise<{ success: boolean; error?: string }> {
    // Check permissions (same as trigger)
    const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_TRIGGER);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const { data: importData, error: fetchError } = await getEmailImport(importId);
    if (fetchError || !importData) {
        return { success: false, error: 'Import not found' };
    }

    // Determine where to resume based on status
    // We allow retrying 'failed' imports too, by checking where they likely failed or just restarting from parsing

    try {
        // If it's stuck in parsing or failed, try to parse -> match -> process
        if (importData.status === 'parsing' || importData.status === 'failed' || importData.status === 'fetching') {
            await updateEmailImportStatus({ importId, status: 'parsing' });
            await parseAllPendingEmails(importId);

            // Check if it moved to match
            const { data: updated } = await getEmailImport(importId);
            if (updated?.status === 'matching') {
                await matchEmailTransactions(importId);
            }

            // Check if it moved to processing
            const { data: updated2 } = await getEmailImport(importId);
            if (updated2?.status === 'processing') {
                await processEmailTransactions(importId);
            }
        }
        // If it's matching, just match -> process
        else if (importData.status === 'matching') {
            await matchEmailTransactions(importId);
            await processEmailTransactions(importId);
        }
        // If it's processing, just process
        else if (importData.status === 'processing') {
            await processEmailTransactions(importId);
        }
        else if (importData.status === 'completed') {
            return { success: false, error: 'Import is already completed' };
        }

        return { success: true };
    } catch (error) {
        console.error('Retry failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Retry failed' };
    }
}
