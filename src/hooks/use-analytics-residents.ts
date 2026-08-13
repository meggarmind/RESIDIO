'use client';

import { useQuery } from '@tanstack/react-query';
import { getResidentAnalytics } from '@/actions/analytics/get-resident-breakdown';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export function useResidentAnalytics() {
  return useQuery({
    queryKey: ['analytics-residents'],
    queryFn: async () => {
      const result = await getResidentAnalytics();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: POLLING_INTERVALS.STANDARD,
    refetchInterval: POLLING_INTERVALS.SLOW,
  });
}
