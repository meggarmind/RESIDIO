'use client';

import { useQuery } from '@tanstack/react-query';
import { getSearchAnalytics } from '@/actions/analytics/get-search-analytics';

interface UseSearchAnalyticsOptions {
    startDate: string;
    endDate: string;
}

export function useSearchAnalytics({ startDate, endDate }: UseSearchAnalyticsOptions) {
    return useQuery({
        queryKey: ['search-analytics', startDate, endDate],
        queryFn: async () => {
            const result = await getSearchAnalytics(startDate, endDate);
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        refetchInterval: 300000, // 5 minutes
        staleTime: 60000,
    });
}
