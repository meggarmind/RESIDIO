'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';
import { getEnhancedDashboardStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const result = await getDashboardStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        // Optimized: 30s → 60s (dashboard data doesn't change that frequently)
        refetchInterval: 60000,
        staleTime: 30000,
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
        refetchInterval: 180000,
        staleTime: 60000, // Consider data fresh for 1 minute
    });
}
