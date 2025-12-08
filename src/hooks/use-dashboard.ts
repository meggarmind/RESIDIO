'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';

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
