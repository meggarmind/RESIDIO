'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { POLLING_INTERVALS } from '@/lib/config/polling';
import { ADMIN_READ_CACHE_TTLS } from '@/lib/offline/admin-read-cache';
import { useOfflineAdminSnapshot } from '@/hooks/use-offline-admin-snapshot';

export const ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY = ['admin-dashboard-snapshot'] as const;

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const result = await getDashboardStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        refetchInterval: POLLING_INTERVALS.SLOW,
        staleTime: POLLING_INTERVALS.SLOW,
    });
}

export function useAdminDashboardSnapshot() {
    return useOfflineAdminSnapshot({
        queryKey: ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY,
        cacheKey: 'dashboard:snapshot',
        queryFn: async () => {
            const result = await getAdminDashboardSnapshot();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        ttlMs: ADMIN_READ_CACHE_TTLS.dashboard,
        queryOptions: {
            refetchInterval: POLLING_INTERVALS.SLOW,
            staleTime: POLLING_INTERVALS.STANDARD,
            refetchOnReconnect: true,
        },
    });
}

export function useEnhancedDashboardStats() {
    return useAdminDashboardSnapshot();
}

export function useDashboardFinancialHealth() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.financialHealth ?? null,
    };
}

export function useDashboardInvoiceDistribution() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.invoiceDistribution ?? null,
    };
}

export function useDashboardSecurityAlerts() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.securityAlerts ?? null,
    };
}

export function useDashboardActionMetrics() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.actionMetrics ?? null,
    };
}

export function useDashboardQuickStats() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.quickStats ?? null,
    };
}

export function useDashboardRecentActivity() {
    const query = useAdminDashboardSnapshot();
    return {
        ...query,
        data: query.data?.recentActivity ?? null,
    };
}
