'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';
import { getEnhancedDashboardStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const result = await getDashboardStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        // Optimized: 30s → 60s (dashboard data doesn't change that frequently)
        refetchInterval: POLLING_INTERVALS.STANDARD,
        staleTime: POLLING_INTERVALS.REALTIME,
    });
}

export function useEnhancedDashboardStats() {
    return useQuery({
        queryKey: ['enhanced-dashboard-stats'],
        queryFn: async () => {
            const result = await getEnhancedDashboardStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        // Optimized: 60s → 180s (heavy query, data is relatively stable)
        refetchInterval: POLLING_INTERVALS.SLOW,
        staleTime: POLLING_INTERVALS.STANDARD, // Consider data fresh for 1 minute
    });
}
