'use client';

import { useQuery } from '@tanstack/react-query';
import { getCollectionsTrend } from '@/actions/analytics/get-collections-trend';
import { getIndebtednessAnalytics } from '@/actions/analytics/get-indebtedness-rankings';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export function useCollectionsTrend(months = 6) {
  return useQuery({
    queryKey: ['analytics-collections-trend', months],
    queryFn: async () => {
      const result = await getCollectionsTrend(months);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: POLLING_INTERVALS.STANDARD,
    refetchInterval: POLLING_INTERVALS.SLOW,
  });
}

export function useIndebtednessAnalytics() {
  return useQuery({
    queryKey: ['analytics-indebtedness'],
    queryFn: async () => {
      const result = await getIndebtednessAnalytics();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: POLLING_INTERVALS.STANDARD,
    refetchInterval: POLLING_INTERVALS.SLOW,
  });
}
