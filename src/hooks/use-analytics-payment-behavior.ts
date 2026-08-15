'use client';

import { useQuery } from '@tanstack/react-query';
import { getPaymentCadenceAnalytics } from '@/actions/analytics/get-payment-cadence';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export function usePaymentCadenceAnalytics() {
  return useQuery({
    queryKey: ['analytics-payment-cadence'],
    queryFn: async () => {
      const result = await getPaymentCadenceAnalytics();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: POLLING_INTERVALS.STANDARD,
    refetchInterval: POLLING_INTERVALS.SLOW,
  });
}
