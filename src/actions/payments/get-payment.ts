'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getPayment(id: string) {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('payment_records')
        .select(`
            *,
            resident:residents!payment_records_resident_id_fkey(
                id,
                first_name,
                last_name,
                resident_code,
                phone_primary,
                email
            ),
            paid_by:residents!payment_records_paid_by_resident_id_fkey(
                id,
                first_name,
                last_name,
                resident_code
            )
        `)
        .eq('id', id)
        .single();

    if (error) {
        return { error: error.message };
    }

    return { data };
}
