'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

// PostgREST caps a bare `.select()` at 1000 rows. Paging by this size keeps each
// page at the cap boundary so a full table is read in the fewest possible round trips.
const PAGE_SIZE = 1000;
// Sane upper bound on paging iterations so a pathological (e.g. corrupted/unbounded)
// dataset can't turn this into a request that loops effectively forever.
const MAX_PAGES = 1000;

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

    // total_collected requires summing `amount` across every 'paid' row. There is no
    // sum RPC for payments, so page through the amount column in PAGE_SIZE chunks
    // until a short (< PAGE_SIZE) page tells us we've read everything.
    let total_collected = 0;
    let page = 0;

    while (page < MAX_PAGES) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
            .from('payment_records')
            .select('amount')
            .eq('status', 'paid')
            .range(from, to);

        if (error) {
            console.error('Fetch payment stats error:', error);
            return { stats: null, error: error.message };
        }

        const rows = data ?? [];
        for (const row of rows) {
            total_collected += Number(row.amount) || 0;
        }

        if (rows.length < PAGE_SIZE) {
            break;
        }

        page += 1;
    }

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
