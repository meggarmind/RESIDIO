'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function checkOverduePayments() {
    const supabase = await createServerSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    try {
        // Update payments that are pending and payment_date is before today
        const { data, error, count } = await supabase
            .from('payment_records')
            .update({ status: 'overdue' })
            .eq('status', 'pending')
            .lt('payment_date', today)
            .select('count'); // Count updated rows if possible, or just select

        if (error) {
            console.error('Error marking overdue payments:', error);
            return { error: 'Failed to update overdue payments' };
        }

        revalidatePath('/payments');
        revalidatePath('/dashboard');

        return {
            success: true,
            message: `Updated payments to overdue.`
        };
    } catch (error) {
        console.error('Unexpected error checking overdue payments:', error);
        return { error: 'An unexpected error occurred' };
    }
}
