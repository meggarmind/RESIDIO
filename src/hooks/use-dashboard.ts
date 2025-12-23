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
        // Refresh every 30 seconds for real-time feel
        refetchInterval: 30000,
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
        // Refresh every 60 seconds (more data = longer interval)
        refetchInterval: 60000,
        staleTime: 30000, // Consider data fresh for 30 seconds
    });
}
