'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';

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
        entityDisplay: `Payment: ${existingPayment.reference || paymentId}`,
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
 * Manually verify an expense record.
 * This is used when an admin wants to mark an expense as verified
 * without matching it to a bank statement row.
 */
export async function manuallyVerifyExpense(
    expenseId: string,
    notes?: string
): Promise<ManualVerifyResult> {
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
