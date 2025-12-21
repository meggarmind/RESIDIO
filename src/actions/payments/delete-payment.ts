'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';

export async function deletePayment(id: string) {
    // Authorization check - only admin, chairman, financial_secretary can delete payments
    const auth = await authorizeAction(ACTION_ROLES.payments);
    if (!auth.authorized) {
        return { error: auth.error, success: false };
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('payment_records')
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message, success: false };
    }

    return { success: true, error: null };
}
