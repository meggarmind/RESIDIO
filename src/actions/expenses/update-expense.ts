'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import type { ExpenseStatus } from '@/types/database';

export async function updateExpenseStatus(expenseId: string, status: ExpenseStatus) {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Fetch existing expense for audit log
    const { data: existingExpense, error: fetchError } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', expenseId)
        .single();

    if (fetchError || !existingExpense) {
        throw new Error('Expense not found');
    }

    if (existingExpense.status === status) {
        return { success: true }; // No change needed
    }

    // Prepare update data
    const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
    };

    // If marking as paid, we might want to auto-verify or track who paid it
    // For now, we trust the manual action. 
    // If it was 'pending' and now 'paid', distinct form verification but related.

    // Update the record
    const { error: updateError } = await supabase
        .from('expenses')
        .update(updateData)
        .eq('id', expenseId);

    if (updateError) {
        console.error('Error updating expense status:', updateError);
        throw new Error('Failed to update expense status');
    }

    // Audit log
    await logAudit({
        action: 'UPDATE',
        entityType: 'expenses',
        entityId: expenseId,
        entityDisplay: `Expense: ${existingExpense.description || 'No description'}`,
        oldValues: { status: existingExpense.status },
        newValues: { status },
    });

    revalidatePath('/expenditure');
    revalidatePath('/analytics'); // Status change might affect financial reports pending/paid split

    return { success: true };
}
