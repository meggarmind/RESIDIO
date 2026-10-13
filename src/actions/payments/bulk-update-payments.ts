'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { paymentStatusEnum } from '@/lib/validators/payment';
import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

const bulkUpdateSchema = z.object({
    ids: z.array(z.string().uuid()).min(1, 'At least one payment ID is required'),
    status: paymentStatusEnum,
});

type BulkUpdatePaymentsInput = z.infer<typeof bulkUpdateSchema>;

export async function bulkUpdatePayments(input: BulkUpdatePaymentsInput) {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_BULK_UPDATE);
    if (!auth.authorized) {
        return { error: auth.error || 'Unauthorized' };
    }

    const validation = bulkUpdateSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const { ids: requestedIds, status } = validation.data;
    const supabase = await createServerSupabaseClient();

    // Get old statuses (and verification state) before update
    const { data: oldRecords, error: fetchError } = await supabase
        .from('payment_records')
        .select('id, status, is_verified')
        .in('id', requestedIds);

    // Fail closed: without the verification state we cannot honour the #502 lock
    if (fetchError || !oldRecords) {
        return { error: 'Could not load the selected payments' };
    }

    // Build map of old statuses
    const oldStatusMap = new Map<string, string>();
    for (const record of oldRecords) {
        oldStatusMap.set(record.id, record.status);
    }

    // #502: a verified payment's status is locked. Update only the unverified ones and
    // report how many were skipped.
    const verifiedIds = new Set(oldRecords.filter((r) => r.is_verified).map((r) => r.id));
    const ids = requestedIds.filter((id) => !verifiedIds.has(id));
    const skippedCount = requestedIds.length - ids.length;
    if (ids.length === 0) {
        return {
            error: `All ${skippedCount} selected payment(s) are verified, so their status is locked. Un-verify them first.`,
        };
    }

    // Bulk update the unverified payments
    const { data, error } = await supabase
        .from('payment_records')
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .in('id', ids)
        .select('id');

    if (error) {
        return { error: error.message };
    }

    const updatedCount = data?.length ?? 0;

    // Audit log for bulk operation
    if (updatedCount > 0) {
        await logAudit({
            action: 'BULK_UPDATE',
            entityType: 'payments',
            entityId: ids[0], // Primary reference
            entityDisplay: `Bulk status update: ${updatedCount} payment(s)`,
            oldValues: {
                payment_ids: ids,
                statuses: ids.map(id => oldStatusMap.get(id) || 'unknown'),
            },
            newValues: {
                payment_ids: ids,
                status,
                updated_count: updatedCount,
            },
            description: `Bulk updated ${updatedCount} payments to status: ${status}`,
        });
    }

    return {
        success: true,
        updatedCount,
        skippedCount,
        message:
            `Successfully updated ${updatedCount} payment(s) to ${status}` +
            (skippedCount > 0 ? `; skipped ${skippedCount} verified payment(s) (un-verify them first)` : ''),
    };
}
