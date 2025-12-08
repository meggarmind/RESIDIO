'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getPaymentStats() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('payment_records')
        .select('status, amount');

    if (error) {
        console.error('Fetch payment stats error:', error);
        return { stats: null, error: error.message };
    }

    const stats = {
        total_collected: 0,
        pending_count: 0,
        overdue_count: 0,
        failed_count: 0
    };

    data?.forEach((r) => {
        const amt = Number(r.amount) || 0;

        if (r.status === 'paid') {
            stats.total_collected += amt;
        } else if (r.status === 'pending') {
            stats.pending_count += 1;
        } else if (r.status === 'overdue') {
            stats.overdue_count += 1;
        } else if (r.status === 'failed') {
            stats.failed_count += 1;
        }
    });

    return { stats, error: null };
}
