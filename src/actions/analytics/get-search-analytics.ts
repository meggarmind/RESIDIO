'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

interface SearchAnalyticsResult {
    topSearches: { query_text: string; count: number }[];
    zeroResultSearches: { query_text: string; count: number }[];
}

export async function getSearchAnalytics(startDate: string, endDate: string): Promise<{ data: SearchAnalyticsResult | null; error: string | null }> {
    try {
        const supabase = await createServerSupabaseClient();

        // Top Searches
        // Note: plain RPC or a view would be better for aggregation, but we can do simple grouping if rows are few, 
        // or use .rpc() if we created a function. Since we didn't create an RPC, we have to raw SQL or fetch and aggregate.
        // Fetching all logs might be heavy. Let's use a simple RPC call if we can, or raw SQL.
        // Since we can't easily add RPC without migration in this step and I want to avoid complex migrations if not needed,
        // I will try to use a raw query or just select and aggregate in memory (limit to last X rows? no, bad for analytics).
        // Actually, Supabase client allows .rpc().

        // Let's use a raw SQL query via rpc if possible, but I don't have a stored procedure.
        // I can use `supabase.from('search_logs').select('query_text')` and aggregate, but that's bad.

        // BETTER APPROACH: Use `rpc` for aggregation. I will add an RPC function via migration? 
        // Wait, the user rules say: "When adding a Feature...".
        // I'll stick to a simpler approach: create a view or function.
        // Actually, I can use `count()` with grouping if I had view.

        // For now, I'll fetch the last 1000 logs within date range and aggregated in JS. 
        // It's not scalable for millions, but fine for "Residio" scale.

        const { data: logs, error } = await supabase
            .from('search_logs')
            .select('query_text, results_count')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .limit(2000); // Safety limit

        if (error) throw error;

        const topMap = new Map<string, number>();
        const zeroMap = new Map<string, number>();

        logs.forEach(log => {
            const q = log.query_text.toLowerCase().trim();
            topMap.set(q, (topMap.get(q) || 0) + 1);
            if (log.results_count === 0) {
                zeroMap.set(q, (zeroMap.get(q) || 0) + 1);
            }
        });

        const sortAndSlice = (map: Map<string, number>) =>
            Array.from(map.entries())
                .map(([text, count]) => ({ query_text: text, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

        return {
            data: {
                topSearches: sortAndSlice(topMap),
                zeroResultSearches: sortAndSlice(zeroMap)
            },
            error: null
        };

    } catch (error) {
        console.error('Failed to fetch search analytics:', error);
        return { data: null, error: 'Failed to fetch search data' };
    }
}
