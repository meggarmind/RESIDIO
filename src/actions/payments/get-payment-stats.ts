'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getPaymentStats() {
    const supabase = await createServerSupabaseClient();

    const [totalResult, paidResult, pendingResult, overdueResult, failedResult] = await Promise.all([
        supabase.from('payment_records').select('*', { count: 'exact', head: true }),
        supabase.from('payment_records').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
        supabase.from('payment_records').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payment_records').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('payment_records').select('*', { count: 'exact', head: true }).eq('status', 'failed')
    ]);

    const countError =
        totalResult.error || paidResult.error || pendingResult.error || overdueResult.error || failedResult.error;

    if (countError) {
        console.error('Fetch payment stats error:', countError);
        return { stats: null, error: countError.message };
    }

    // One server-side SUM instead of paging every paid row (#776). SECURITY INVOKER RPC, so RLS applies.
    const { data: paidSum, error: sumError } = await supabase.rpc('sum_paid_payments');

    if (sumError) {
        console.error('Fetch payment stats error:', sumError);
        return { stats: null, error: sumError.message };
    }

    const total_collected = Number(paidSum) || 0;

    const stats = {
        total_collected,
        total_count: totalResult.count ?? 0,
        paid_count: paidResult.count ?? 0,
        pending_count: pendingResult.count ?? 0,
        overdue_count: overdueResult.count ?? 0,
        failed_count: failedResult.count ?? 0
    };

    return { stats, error: null };
}
