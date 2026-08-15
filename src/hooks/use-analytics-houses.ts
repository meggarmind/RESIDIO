'use client';

import { useQuery } from '@tanstack/react-query';
import { getHouseStreetAnalytics } from '@/actions/analytics/get-house-street-breakdown';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export function useHouseStreetAnalytics() {
  return useQuery({
    queryKey: ['analytics-houses'],
    queryFn: async () => {
      const result = await getHouseStreetAnalytics();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: POLLING_INTERVALS.STANDARD,
    refetchInterval: POLLING_INTERVALS.SLOW,
  });
}
