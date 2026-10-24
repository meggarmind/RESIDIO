'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { z } from 'zod';

// ============================================================
// Manual Verification Actions for Payments and Expenses
// Part of Unified Expenditure Engine
// ============================================================

interface ManualVerifyResult {
    success: boolean;
    error?: string;
}

/**
 * Manually verify a payment record.
 * This is used when an admin wants to mark a payment as verified
 * without matching it to a bank statement row.
 */
export async function manuallyVerifyPayment(
    paymentId: string,
    notes?: string
): Promise<ManualVerifyResult> {
    const { authorized } = await authorizePermission(PERMISSIONS.PAYMENTS_VERIFY);
    if (!authorized) {
        return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch the existing payment
    const { data: existingPayment, error: fetchError } = await supabase
        .from('payment_records')
        .select('*')
        .eq('id', paymentId)
        .single();

    if (fetchError || !existingPayment) {
        return { success: false, error: 'Payment not found' };
    }

    if (existingPayment.is_verified) {
        return { success: false, error: 'Payment is already verified' };
    }

    // A payment a resident reported over WhatsApp (#816) is still pending and only becomes a paid, credited
    // payment when its approval is approved; verifying it here would leave it verified but never paid.
    if (existingPayment.status === 'pending' && existingPayment.approval_request_id) {
        return { success: false, error: 'This payment was reported by the resident. Approve or reject it in Approvals.' };
    }

    // Update the payment to verified
    const { error: updateError } = await supabase
        .from('payment_records')
        .update({
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: user.id,
            notes: notes
                ? `${existingPayment.notes || ''}\n[Manual Verification]: ${notes}`.trim()
                : existingPayment.notes,
        })
        .eq('id', paymentId);

    if (updateError) {
        console.error('Error verifying payment:', updateError);
        return { success: false, error: 'Failed to verify payment' };
    }

    // Audit log
    await logAudit({
        action: 'UPDATE',
        entityType: 'payment_records',
        entityId: paymentId,
        entityDisplay: `Payment: ${existingPayment.reference_number || paymentId}`,
        oldValues: { is_verified: false },
        newValues: {
            is_verified: true,
            verified_by: user.id,
            verification_type: 'manual',
        },
    });

    revalidatePath('/payments');
    revalidatePath('/dashboard');

    return { success: true };
}

/**
 * Un-verify a payment record (#502). A verified payment's amount, payer, property and
 * status are locked; this is the audited route to correct one. Uses the same permission
 * as manuallyVerifyPayment (payments.verify, #812).
 */
export async function unverifyPayment(
    paymentId: string,
    reason?: string
): Promise<ManualVerifyResult> {
    const { authorized } = await authorizePermission(PERMISSIONS.PAYMENTS_VERIFY);
    if (!authorized) {
        return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    const { data: existingPayment, error: fetchError } = await supabase
        .from('payment_records')
        .select('*')
        .eq('id', paymentId)
        .single();

    if (fetchError || !existingPayment) {
        return { success: false, error: 'Payment not found' };
    }

    if (!existingPayment.is_verified) {
        return { success: false, error: 'Payment is not verified' };
    }

    const { error: updateError } = await supabase
        .from('payment_records')
        .update({
            is_verified: false,
            verified_at: null,
            verified_by: null,
            notes: reason
                ? `${existingPayment.notes || ''}\n[Un-verified]: ${reason}`.trim()
                : existingPayment.notes,
        })
        .eq('id', paymentId);

    if (updateError) {
        console.error('Error un-verifying payment:', updateError);
        return { success: false, error: 'Failed to un-verify payment' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'payment_records',
        entityId: paymentId,
        entityDisplay: `Payment: ${existingPayment.reference_number || paymentId}`,
        oldValues: {
            is_verified: true,
            verified_by: existingPayment.verified_by,
            bank_row_id: existingPayment.bank_row_id ?? null,
        },
        newValues: {
            is_verified: false,
            unverified_by: user.id,
            was_bank_matched: existingPayment.bank_row_id != null,
            verification_type: 'manual',
        },
    });

    revalidatePath('/payments');
    revalidatePath('/dashboard');

    return { success: true };
}

const bulkVerifySchema = z.object({
    ids: z
        .array(z.guid())
        .min(1, 'At least one payment ID is required')
        .max(500, 'At most 500 payments can be verified at once'),
    notes: z.string().optional(),
});

interface BulkVerifyResult {
    success: boolean;
    error?: string;
    verifiedCount?: number;
    skippedCount?: number;
    message?: string;
}

/**
 * Verify several payments at once (#812). Payments that are already verified are skipped and
 * counted. Each verified payment gets its own audit entry. Verification locks the payment (#502).
 */
export async function bulkVerifyPayments(
    ids: string[],
    notes?: string
): Promise<BulkVerifyResult> {
    const { authorized } = await authorizePermission(PERMISSIONS.PAYMENTS_VERIFY);
    if (!authorized) {
        return { success: false, error: 'Unauthorized' };
    }

    const validation = bulkVerifySchema.safeParse({ ids, notes });
    if (!validation.success) {
        return { success: false, error: validation.error.issues[0].message };
    }

    const requestedIds = [...new Set(validation.data.ids)];
    const verificationNotes = validation.data.notes?.trim() || undefined;
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    const { data: existing, error: fetchError } = await supabase
        .from('payment_records')
        .select('id, is_verified, status, approval_request_id')
        .in('id', requestedIds);

    if (fetchError || !existing) {
        console.error('Error loading payments to verify:', fetchError);
        return { success: false, error: 'Could not load the selected payments' };
    }

    // Payments reported over WhatsApp (#816) are settled through Approvals, not verified in bulk.
    const toVerify = existing.filter((p) => !p.is_verified && !(p.status === 'pending' && p.approval_request_id)).map((p) => p.id);
    const skippedCount = requestedIds.length - toVerify.length;
    if (toVerify.length === 0) {
        return { success: false, error: `All ${skippedCount} selected payment(s) are already verified, awaiting approval or no longer exist` };
    }

    // The is_verified filter keeps a payment verified concurrently from being re-stamped
    const { data: verified, error: updateError } = await supabase
        .from('payment_records')
        .update({
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: user.id,
        })
        .in('id', toVerify)
        .eq('is_verified', false)
        .select('id, reference_number');

    if (updateError) {
        console.error('Error bulk verifying payments:', updateError);
        return { success: false, error: 'Failed to verify payments' };
    }

    const verifiedRows = verified ?? [];
    await Promise.all(
        verifiedRows.map((payment) =>
            logAudit({
                action: 'VERIFY',
                entityType: 'payment_records',
                entityId: payment.id,
                entityDisplay: `Payment: ${payment.reference_number || payment.id}`,
                oldValues: { is_verified: false },
                newValues: {
                    is_verified: true,
                    verified_by: user.id,
                    verification_type: 'manual_bulk',
                    ...(verificationNotes ? { notes: verificationNotes } : {}),
                },
            })
        )
    );

    revalidatePath('/payments');
    revalidatePath('/dashboard');

    const verifiedCount = verifiedRows.length;
    const totalSkipped = requestedIds.length - verifiedCount;
    return {
        success: true,
        verifiedCount,
        skippedCount: totalSkipped,
        message:
            `Verified ${verifiedCount} payment(s)` +
            (totalSkipped > 0 ? `; skipped ${totalSkipped} already verified or missing` : ''),
    };
}

/**
 * Manually verify an expense record.
 * This is used when an admin wants to mark an expense as verified
 * without matching it to a bank statement row.
 */
export async function manuallyVerifyExpense(
    expenseId: string,
    notes?: string
): Promise<ManualVerifyResult> {
    const { authorized } = await authorizePermission(PERMISSIONS.EXPENDITURE_MANAGE);
    if (!authorized) {
        return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch the existing expense
    const { data: existingExpense, error: fetchError } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .single();

    if (fetchError || !existingExpense) {
        return { success: false, error: 'Expense not found' };
    }

    if (existingExpense.is_verified) {
        return { success: false, error: 'Expense is already verified' };
    }

    // Update the expense to verified
    const { error: updateError } = await supabase
        .from('expenses')
        .update({
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: user.id,
        })
        .eq('id', expenseId);

    if (updateError) {
        console.error('Error verifying expense:', updateError);
        return { success: false, error: 'Failed to verify expense' };
    }

    // Audit log
    await logAudit({
        action: 'UPDATE',
        entityType: 'expenses',
        entityId: expenseId,
        entityDisplay: `Expense: ${existingExpense.description || expenseId}`,
        oldValues: { is_verified: false },
        newValues: {
            is_verified: true,
            verified_by: user.id,
            verification_type: 'manual',
        },
    });

    revalidatePath('/expenditure');
    revalidatePath('/dashboard');

    return { success: true };
}

/**
 * Get verification status details for a payment or expense.
 * Returns verification info including who verified it and when.
 */
export async function getVerificationDetails(
    entityType: 'payment' | 'expense',
    entityId: string
) {
    const supabase = await createServerSupabaseClient();

    const tableName = entityType === 'payment' ? 'payment_records' : 'expenses';

    const { data, error } = await supabase
        .from(tableName)
        .select(`
            is_verified,
            verified_at,
            verified_by,
            bank_row_id,
            verifier:profiles!verified_by (
                id,
                full_name,
                email
            )
        `)
        .eq('id', entityId)
        .single();

    if (error) {
        console.error('Error fetching verification details:', error);
        return null;
    }

    // The verifier is returned as a single object (not array) due to .single()
    // Using unknown as intermediate to satisfy TypeScript's strict type checking
    const verifier = data.verifier as unknown as { id: string; full_name: string; email: string } | null;

    return {
        isVerified: data.is_verified,
        verifiedAt: data.verified_at,
        verifiedBy: data.verified_by,
        verifierName: verifier?.full_name || null,
        isAutoVerified: data.bank_row_id !== null,
        bankRowId: data.bank_row_id,
    };
}
