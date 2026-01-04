'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getAnnouncementMetrics,
  getPublishedTrend,
  getCategoryEngagement,
  getPriorityDistribution,
  getTopAnnouncements,
  type AnnouncementMetrics,
  type TimeSeriesDataPoint,
  type CategoryEngagement,
  type PriorityDistribution,
  type TopAnnouncement,
} from '@/actions/announcements/analytics';

// =====================================================
// Analytics Hook
// =====================================================

export interface AnnouncementAnalyticsParams {
  startDate: string;
  endDate: string;
  granularity?: 'day' | 'week' | 'month';
  topLimit?: number;
}

export interface AnnouncementAnalyticsData {
  metrics: AnnouncementMetrics | null;
  publishedTrend: TimeSeriesDataPoint[] | null;
  categoryEngagement: CategoryEngagement[] | null;
  priorityDistribution: PriorityDistribution[] | null;
  topAnnouncements: TopAnnouncement[] | null;
}

/**
 * Comprehensive analytics hook that fetches all announcement metrics in parallel
 * Stale time set to 5 minutes since analytics don't need real-time updates
 */
export function useAnnouncementAnalytics(params: AnnouncementAnalyticsParams) {
  return useQuery({
    queryKey: ['announcementAnalytics', params],
    queryFn: async () => {
      // Execute all queries in parallel for performance
      const [metricsResult, trendResult, categoryResult, priorityResult, topResult] =
        await Promise.all([
          getAnnouncementMetrics(params.startDate, params.endDate),
          getPublishedTrend(params.startDate, params.endDate, params.granularity || 'month'),
          getCategoryEngagement(params.startDate, params.endDate),
          getPriorityDistribution(params.startDate, params.endDate),
          getTopAnnouncements(params.startDate, params.endDate, params.topLimit || 10),
        ]);

      // Check for any errors
      if (metricsResult.error) throw new Error(metricsResult.error);
      if (trendResult.error) throw new Error(trendResult.error);
      if (categoryResult.error) throw new Error(categoryResult.error);
      if (priorityResult.error) throw new Error(priorityResult.error);
      if (topResult.error) throw new Error(topResult.error);

      const data: AnnouncementAnalyticsData = {
        metrics: metricsResult.data,
        publishedTrend: trendResult.data,
        categoryEngagement: categoryResult.data,
        priorityDistribution: priorityResult.data,
        topAnnouncements: topResult.data,
      };

      return data;
    },
    // Analytics data doesn't need real-time updates
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Retry on error
    retry: 2,
  });
}

/**
 * Individual metric hooks for more granular control
 */

export function useAnnouncementMetrics(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['announcementMetrics', startDate, endDate],
    queryFn: async () => {
      const result = await getAnnouncementMetrics(startDate, endDate);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublishedTrend(
  startDate: string,
  endDate: string,
  granularity: 'day' | 'week' | 'month' = 'month'
) {
  return useQuery({
    queryKey: ['publishedTrend', startDate, endDate, granularity],
    queryFn: async () => {
      const result = await getPublishedTrend(startDate, endDate, granularity);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategoryEngagement(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['categoryEngagement', startDate, endDate],
    queryFn: async () => {
      const result = await getCategoryEngagement(startDate, endDate);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePriorityDistribution(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['priorityDistribution', startDate, endDate],
    queryFn: async () => {
      const result = await getPriorityDistribution(startDate, endDate);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopAnnouncements(startDate: string, endDate: string, limit: number = 10) {
  return useQuery({
    queryKey: ['topAnnouncements', startDate, endDate, limit],
    queryFn: async () => {
      const result = await getTopAnnouncements(startDate, endDate, limit);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
