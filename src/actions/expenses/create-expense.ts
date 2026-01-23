'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import type { ExpenseSourceType, ExpensePaymentMethod } from '@/types/database';

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
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Determine verification status based on source
    // Petty cash and bank imports are auto-verified
    const isVerified = input.is_verified ??
        (input.source_type === 'petty_cash' || input.source_type === 'bank_import');

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
        throw new Error(`Duplicate Expense Detected: ${dupResult.reason}`);
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
            created_by: user.id
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
        throw new Error('Failed to create expense');
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

    return data;
}
