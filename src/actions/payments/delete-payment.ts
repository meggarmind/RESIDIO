'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

export async function deletePayment(id: string) {
    // Authorization check - only admin, chairman, financial_secretary can delete payments
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_DELETE);
    if (!auth.authorized) {
        return { error: auth.error, success: false };
    }

    const supabase = await createServerSupabaseClient();

    // Capture the full record first: this is a hard delete, so the audit entry is
    // the only remaining evidence of what the payment contained.
    const { data: existing } = await supabase
        .from('payment_records')
        .select('*')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('payment_records')
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message, success: false };
    }

    if (existing) {
        await logAudit({
            action: 'DELETE',
            entityType: 'payments',
            entityId: id,
            entityDisplay: `Payment ₦${Number(existing.amount).toLocaleString()}${existing.reference_number ? ` (${existing.reference_number})` : ''}`,
            oldValues: existing,
        });
    }

    return { success: true, error: null };
}
