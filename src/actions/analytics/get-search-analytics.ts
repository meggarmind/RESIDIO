'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

interface SearchAnalyticsResult {
    topSearches: { query_text: string; count: number }[];
    zeroResultSearches: { query_text: string; count: number }[];
}

/**
 * Returns the top searched queries and top zero-result queries within a date
 * range, aggregated from `search_logs`.
 *
 * `search_logs` records what every admin typed into search (query_text),
 * who searched (user_id), and whether it matched anything (results_count) —
 * that's admin-behavioural log data, closest in kind to an audit trail, so
 * reading it requires the same permission as the audit log
 * (`settings.view_audit_logs`) rather than a general analytics permission
 * that doesn't exist yet.
 */
export async function getSearchAnalytics(startDate: string, endDate: string): Promise<{ data: SearchAnalyticsResult | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    try {
        const supabase = await createServerSupabaseClient();

        // There is no aggregation RPC/view for search_logs, so we fetch a
        // bounded window of rows (capped at 2000) within the requested date
        // range and group them client-side into topSearches / zeroResultSearches.
        // At Residio's current volume (tens of rows total) this is exact. If
        // search_logs ever grows large enough to approach the 2000-row cap,
        // this would need to become a real SQL GROUP BY (view or RPC) instead
        // of an in-memory aggregation — not needed at current scale.
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
