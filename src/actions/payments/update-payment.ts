'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { paymentFormSchema } from '@/lib/validators/payment';
import { z } from 'zod';

const updatePaymentSchema = paymentFormSchema.partial();

export async function updatePayment(id: string, data: z.infer<typeof updatePaymentSchema>) {
    // Authorization check - only admin, chairman, financial_secretary can update payments
    const auth = await authorizeAction(ACTION_ROLES.payments);
    if (!auth.authorized) {
        return { error: auth.error, success: false };
    }

    const supabase = await createServerSupabaseClient();

    // Capture the pre-update state so the audit entry records what actually changed
    const { data: oldRecord } = await supabase
        .from('payment_records')
        .select('*')
        .eq('id', id)
        .single();

    // Format dates if present
    const updates: Record<string, unknown> = { ...data };
    if (data.payment_date) updates.payment_date = data.payment_date.toISOString();
    if (data.period_start) updates.period_start = data.period_start.toISOString();
    if (data.period_end) updates.period_end = data.period_end.toISOString();

    const { data: updated, error } = await supabase
        .from('payment_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return { error: error.message, success: false };
    }

    if (oldRecord && updated) {
        const changes = getChangedValues(oldRecord, updated);
        await logAudit({
            action: 'UPDATE',
            entityType: 'payments',
            entityId: id,
            entityDisplay: `Payment ₦${Number(updated.amount).toLocaleString()}${updated.reference_number ? ` (${updated.reference_number})` : ''}`,
            oldValues: changes.old,
            newValues: changes.new,
        });
    }

    return { success: true, error: null };
}
