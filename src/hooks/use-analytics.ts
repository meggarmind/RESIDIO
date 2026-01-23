'use client';

import { useQuery } from '@tanstack/react-query';
import { getAnalyticsData } from '@/actions/analytics/get-analytics-data';
import type { AnalyticsData } from '@/types/analytics';
import { POLLING_INTERVALS } from '@/lib/config/polling';

interface UseAnalyticsOptions {
  startDate: string;
  endDate: string;
}

/**
 * Hook for fetching analytics data
 *
 * Uses React Query for caching and automatic refetching.
 * Data is considered stale after 60 seconds and auto-refreshes every 2 minutes.
 */
export function useAnalytics({ startDate, endDate }: UseAnalyticsOptions) {
  return useQuery<AnalyticsData | null, Error>({
    queryKey: ['analytics', startDate, endDate],
    queryFn: async () => {
      const result = await getAnalyticsData(startDate, endDate);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    // Auto-refresh every 2 minutes for real-time updates
    refetchInterval: POLLING_INTERVALS.SLOW, // 120s -> 180s (SLOW)
    // Consider data fresh for 60 seconds
    staleTime: POLLING_INTERVALS.STANDARD,
    // Keep previous data while fetching new date range
    placeholderData: (previousData) => previousData,
  });
}
