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

    // 1. Delete associated email_transactions first (FK constraints)
    if (params?.userId) {
        // Fetch import ids for the user
        const { data: importIds, error: fetchError } = await supabase
            .from('email_imports')
            .select('id')
            .eq('created_by', params.userId);

        if (fetchError) {
            console.error('Failed to fetch import ids for transactions cleanup:', fetchError);
            return { success: false, error: fetchError.message };
        }

        const ids = (importIds || []).map((i: { id: string }) => i.id);
        if (ids.length > 0) {
            const { error: transError } = await supabase
                .from('email_transactions')
                .delete()
                .in('email_import_id', ids);

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

    // 2. Delete email_messages
    if (params?.userId) {
        // We already fetched importIds for the user above
        const { data: importIds } = await supabase
            .from('email_imports')
            .select('id')
            .eq('created_by', params.userId);

        const ids = (importIds || []).map((i: { id: string }) => i.id);
        if (ids.length > 0) {
            const { error: msgError } = await supabase
                .from('email_messages')
                .delete()
                .in('email_import_id', ids);

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

    // 3. Delete email_imports
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
