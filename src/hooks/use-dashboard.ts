'use client';

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';
import { getEnhancedDashboardStats, getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import {
  getDashboardFinancialHealth,
  getDashboardInvoiceDistribution,
  getDashboardSecurityAlerts,
  getDashboardActionMetrics,
  getDashboardQuickStats,
  getDashboardRecentActivity,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { POLLING_INTERVALS } from '@/lib/config/polling';

export const ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY = ['admin-dashboard-snapshot'] as const;

export function useDashboardStats() {
    return useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const result = await getDashboardStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        // Optimized: 60s → 180s (aggregated dashboard data is stable)
        refetchInterval: POLLING_INTERVALS.SLOW,
        staleTime: POLLING_INTERVALS.SLOW,
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

export function useAdminDashboardSnapshot() {
    return useQuery({
        queryKey: ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY,
        queryFn: async () => {
            const result = await getAdminDashboardSnapshot();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        refetchInterval: POLLING_INTERVALS.SLOW,
        staleTime: POLLING_INTERVALS.STANDARD,
    });
}

export function useDashboardFinancialHealth() {
    return useQuery({
        queryKey: ['dashboard-financial-health'],
        queryFn: async () => {
            const result = await getDashboardFinancialHealth();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.SLOW,
    });
}

export function useDashboardInvoiceDistribution() {
    return useQuery({
        queryKey: ['dashboard-invoice-distribution'],
        queryFn: async () => {
            const result = await getDashboardInvoiceDistribution();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.SLOW,
    });
}

export function useDashboardSecurityAlerts() {
    return useQuery({
        queryKey: ['dashboard-security-alerts'],
        queryFn: async () => {
            const result = await getDashboardSecurityAlerts();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.SLOW,
    });
}

export function useDashboardActionMetrics() {
    return useQuery({
        queryKey: ['dashboard-action-metrics'],
        queryFn: async () => {
            const result = await getDashboardActionMetrics();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.STANDARD,
    });
}

export function useDashboardQuickStats() {
    return useQuery({
        queryKey: ['dashboard-quick-stats'],
        queryFn: async () => {
            const result = await getDashboardQuickStats();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.STANDARD,
    });
}

export function useDashboardRecentActivity() {
    return useQuery({
        queryKey: ['dashboard-recent-activity'],
        queryFn: async () => {
            const result = await getDashboardRecentActivity();
            if (result.error) throw new Error(result.error);
            return result.data;
        },
        staleTime: POLLING_INTERVALS.STANDARD,
    });
}
