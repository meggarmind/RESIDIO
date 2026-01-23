'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

/**
 * Reset all email import data for the current user (or globally if admin).
 * Deletes all rows from `email_imports`, `email_messages`, and `email_transactions` tables.
 * Returns a success flag or an error message.
 */
export async function resetEmailImports(params?: { userId?: string }): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();

    // 1. Fetch import IDs if user-scoped
    let targetImportIds: string[] = [];

    if (params?.userId) {
        const { data: importIds, error: fetchError } = await supabase
            .from('email_imports')
            .select('id')
            .eq('created_by', params.userId);

        if (fetchError) {
            console.error('Failed to fetch import ids for cleanup:', fetchError);
            return { success: false, error: fetchError.message };
        }
        targetImportIds = (importIds || []).map((i: { id: string }) => i.id);
    }

    // 2. Break circular dependency: Set payment_id to NULL in email_transactions
    // This allows us to delete payment_records without violating FK from email_transactions -> payment_records
    if (params?.userId) {
        if (targetImportIds.length > 0) {
            const { error: updateError } = await supabase
                .from('email_transactions')
                .update({ payment_id: null })
                .in('email_import_id', targetImportIds);

            if (updateError) {
                console.error('Failed to unlink payment_records from transactions:', updateError);
                return { success: false, error: updateError.message };
            }
        }
    } else {
        // Global unlink
        const { error: updateError } = await supabase
            .from('email_transactions')
            .update({ payment_id: null })
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (updateError) {
            console.error('Failed to unlink payment_records from transactions:', updateError);
            return { success: false, error: updateError.message };
        }
    }

    // 3. Delete associated payment_records (FK constraints)
    // We must delete these first because they reference email_transactions and email_imports
    if (params?.userId) {
        if (targetImportIds.length > 0) {
            const { error: payError } = await supabase
                .from('payment_records')
                .delete()
                .in('email_import_id', targetImportIds);

            if (payError) {
                console.error('Failed to delete payment_records:', payError);
                return { success: false, error: payError.message };
            }
        }
    } else {
        // Global delete - remove all payment records linked to any email import
        const { error: payError } = await supabase
            .from('payment_records')
            .delete()
            .not('email_import_id', 'is', null);

        if (payError) {
            console.error('Failed to delete payment_records:', payError);
            return { success: false, error: payError.message };
        }
    }

    // 4. Delete associated email_transactions
    if (params?.userId) {
        if (targetImportIds.length > 0) {
            const { error: transError } = await supabase
                .from('email_transactions')
                .delete()
                .in('email_import_id', targetImportIds);

            if (transError) {
                console.error('Failed to delete email_transactions:', transError);
                return { success: false, error: transError.message };
            }
        }
    } else {
        // Global delete with dummy filter to satisfy WHERE clause requirement
        const { error: transError } = await supabase
            .from('email_transactions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (transError) {
            console.error('Failed to delete email_transactions:', transError);
            return { success: false, error: transError.message };
        }
    }

    // 5. Delete email_messages
    if (params?.userId) {
        if (targetImportIds.length > 0) {
            const { error: msgError } = await supabase
                .from('email_messages')
                .delete()
                .in('email_import_id', targetImportIds);

            if (msgError) {
                console.error('Failed to delete email_messages:', msgError);
                return { success: false, error: msgError.message };
            }
        }
    } else {
        // Global delete with dummy filter
        const { error: msgError } = await supabase
            .from('email_messages')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (msgError) {
            console.error('Failed to delete email_messages:', msgError);
            return { success: false, error: msgError.message };
        }
    }

    // 6. Delete email_imports
    const filter = params?.userId
        ? supabase.from('email_imports').delete().eq('created_by', params.userId)
        : supabase.from('email_imports').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: importError } = await filter;
    if (importError) {
        console.error('Failed to delete email_imports:', importError);
        return { success: false, error: importError.message };
    }

    // Audit log
    await logAudit({
        action: 'DELETE',
        entityType: 'email_imports',
        entityId: 'ALL',
        entityDisplay: `Reset Email Imports${params?.userId ? ` for user ${params.userId}` : ''}`,
        newValues: {},
    });

    return { success: true };
}
