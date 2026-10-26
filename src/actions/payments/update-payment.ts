'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { paymentFormSchema } from '@/lib/validators/payment';
import { residentHasHouse } from '@/lib/payments/house-membership';
import { findLockedFieldChanges, VERIFIED_LOCK_MESSAGE } from '@/lib/payments/verified-lock';
import { z } from 'zod';

// The category moves money between wallets, so it changes only through retagPaymentCategory (#1190).
const updatePaymentSchema = paymentFormSchema.omit({ charge_category: true }).partial();

export async function updatePayment(id: string, data: z.infer<typeof updatePaymentSchema>) {
    // Authorization check - only admin, chairman, financial_secretary can update payments
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_UPDATE);
    if (!auth.authorized) {
        return { error: auth.error, success: false };
    }

    // Parse for real. Unknown keys (is_verified, verified_by, bank_row_id, import ids,
    // created_by ...) are stripped by Zod; verification has its own permission and
    // action, so none of those can be written through the ordinary edit.
    const parsed = updatePaymentSchema.safeParse(data);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || 'Invalid payment data', success: false };
    }
    const input = parsed.data;

    const supabase = await createServerSupabaseClient();

    // Capture the pre-update state so the audit entry records what actually changed
    const { data: oldRecord, error: fetchError } = await supabase
        .from('payment_records')
        .select('*')
        .eq('id', id)
        .single();

    // Fail closed: without the stored record we cannot tell whether the payment is verified
    if (fetchError || !oldRecord) {
        return { error: 'Payment not found', success: false };
    }

    // #502: a verified payment's amount, payer, property and status are frozen. The form
    // re-sends the unchanged values, so only a real difference is refused.
    if (findLockedFieldChanges(oldRecord.is_verified, oldRecord, input).length > 0) {
        return { error: VERIFIED_LOCK_MESSAGE, success: false };
    }

    // A house must belong to the (possibly changed) resident
    // Only re-validate when the house or the resident actually changes: the edit form always
    // re-sends house_id, and legacy/imported payments may have no resident_houses row.
    const newResidentId = input.resident_id ?? oldRecord?.resident_id;
    const houseChanged = input.house_id !== undefined && input.house_id !== (oldRecord?.house_id ?? null);
    const residentChanged = input.resident_id !== undefined && input.resident_id !== oldRecord?.resident_id;
    const houseId = input.house_id !== undefined ? input.house_id : (oldRecord?.house_id ?? null);
    if (houseId && (houseChanged || residentChanged)) {
        const residentId = newResidentId;
        if (!residentId) return { error: 'Payment not found', success: false };
        const membership = await residentHasHouse(supabase, residentId, houseId);
        if (!membership.ok) return { error: membership.error, success: false };
    }

    // Explicit allow-list of editable columns
    const updates: Record<string, unknown> = {};
    if (input.resident_id !== undefined) updates.resident_id = input.resident_id;
    if (input.house_id !== undefined) updates.house_id = input.house_id;
    if (input.amount !== undefined) updates.amount = input.amount;
    if (input.status !== undefined) updates.status = input.status;
    if (input.method !== undefined) updates.method = input.method;
    if (input.reference_number !== undefined) updates.reference_number = input.reference_number;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.paid_by_resident_id !== undefined) updates.paid_by_resident_id = input.paid_by_resident_id;
    if (input.paid_by_name !== undefined) updates.paid_by_name = input.paid_by_name?.trim() || null;
    if (input.payment_date) updates.payment_date = input.payment_date.toISOString();
    if (input.period_start) updates.period_start = input.period_start.toISOString();
    if (input.period_end) updates.period_end = input.period_end.toISOString();

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
