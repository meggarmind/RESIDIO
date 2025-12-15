'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function deletePayment(id: string) {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('payment_records')
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    return { success: true };
}
