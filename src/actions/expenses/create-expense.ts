'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import type { ExpenseSourceType, ExpensePaymentMethod } from '@/types/database';
import { validateMoneyAmount } from '@/lib/validators/money';

export interface CreateExpenseInput {
    amount: number;
    category_id: string;
    expense_date: string;
    description?: string;
    vendor_id?: string;
    project_id?: string;
    status?: 'pending' | 'paid' | 'cancelled';
    // Unified Expenditure Engine fields
    source_type?: ExpenseSourceType;
    payment_method?: ExpensePaymentMethod;
    petty_cash_account_id?: string;
    is_verified?: boolean;
    bank_row_id?: string;
    resident_id?: string;
    staff_id?: string;
}

export async function createExpense(input: CreateExpenseInput) {
    const { authorized, userId } = await authorizePermission(PERMISSIONS.EXPENDITURE_MANAGE);
    if (!authorized) return { data: null, error: 'Unauthorized' };

    const amountError = validateMoneyAmount(input.amount, { label: 'Expense amount' });
    if (amountError) return { data: null, error: amountError };

    const expenseDate = typeof input.expense_date === 'string' ? input.expense_date : '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(expenseDate) || Number.isNaN(Date.parse(expenseDate))) {
        return { data: null, error: 'Expense date must be a valid date' };
    }

    const supabase = await createServerSupabaseClient();

    // Determine verification status based on source.
    // Petty cash and bank imports are auto-verified. The client-supplied
    // is_verified flag is honoured only for those sources: a manual expense can
    // never be created pre-verified (it must go through manual verification).
    const autoVerifiedSource =
        input.source_type === 'petty_cash' || input.source_type === 'bank_import';
    const isVerified = autoVerifiedSource ? (input.is_verified ?? true) : false;

    // Helper to sanitize UUID inputs (convert empty strings to null)
    const sanitizeUuid = (id?: string) => (!id || id.trim() === '') ? null : id;

    // Check for duplicates
    const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
    const dupResult = await checkDuplicateGuardrail({
        amount: input.amount,
        date: input.expense_date,
        description: input.description,
        reference: undefined // Expenses typically don't have strict reference unique check here, or input.reference if existed
    }, 'expense');

    if (dupResult.isDuplicate) {
        return { data: null, error: `Duplicate Expense Detected: ${dupResult.reason}` };
    }

    const { data, error } = await supabase
        .from('expenses')
        .insert([{
            amount: input.amount,
            category_id: input.category_id,
            expense_date: input.expense_date,
            description: input.description,
            vendor_id: sanitizeUuid(input.vendor_id),
            project_id: sanitizeUuid(input.project_id),
            resident_id: sanitizeUuid(input.resident_id),
            staff_id: sanitizeUuid(input.staff_id),
            status: input.status ?? 'pending',
            source_type: input.source_type ?? 'manual',
            payment_method: input.payment_method ?? 'bank_transfer',
            petty_cash_account_id: sanitizeUuid(input.petty_cash_account_id),
            is_verified: isVerified,
            verified_at: isVerified ? new Date().toISOString() : null,
            bank_row_id: sanitizeUuid(input.bank_row_id),
            created_by: userId
        }])
        .select(`
            *,
            category:expense_categories(name),
            vendor:vendors(name),
            resident:residents!resident_id(first_name, last_name),
            staff:profiles!staff_id(full_name)
        `)
        .single();

    if (error) {
        console.error('Error creating expense:', error);
        return { data: null, error: 'Failed to create expense' };
    }

    // Audit log
    await logAudit({
        action: 'CREATE',
        entityType: 'expenses',
        entityId: data.id,
        entityDisplay: `Expense: ${input.description || 'No description'}`,
        newValues: {
            amount: input.amount,
            source_type: input.source_type ?? 'manual',
            is_verified: isVerified,
        },
    });

    revalidatePath('/analytics');
    revalidatePath('/expenditure');
    revalidatePath('/projects');
    if (input.project_id) {
        revalidatePath(`/projects/${input.project_id}`);
    }

    return { data, error: null };
}
