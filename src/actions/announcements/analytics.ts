'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { format } from 'date-fns';

// =====================================================
// Types
// =====================================================

export interface AnnouncementMetrics {
  totalPublished: number;
  totalReached: number;
  avgEngagementRate: number;
  emergencyBroadcasts: number;
}

export interface TimeSeriesDataPoint {
  label: string;
  value: number;
}

export interface CategoryEngagement {
  category_name: string;
  total_published: number;
  total_reads: number;
  engagement_rate: number;
}

export interface PriorityDistribution {
  priority: string;
  count: number;
  percentage: number;
}

export interface TopAnnouncement {
  id: string;
  title: string;
  category_name: string | null;
  priority: string;
  published_at: string;
  read_count: number;
  target_count: number;
  engagement_rate: number;
}

// =====================================================
// Helper Functions
// =====================================================

async function calculateTargetCount(
  targetAudience: string | null,
  targetHouses: string[] | null
): Promise<number> {
  const supabase = await createServerSupabaseClient();

  if (targetAudience === 'all' || targetAudience === 'residents') {
    const { count } = await supabase
      .from('residents')
      .select('*', { count: 'exact', head: true })
      .eq('account_status', 'active');
    return count || 0;
  }

  if (targetHouses && targetHouses.length > 0) {
    const { data } = await supabase
      .from('resident_houses')
      .select('resident_id')
      .in('house_id', targetHouses)
      .eq('is_active', true);
    return new Set(data?.map((rh) => rh.resident_id) || []).size;
  }

  return 0;
}

// =====================================================
// Analytics Queries
// =====================================================

/**
 * Get announcement metrics for a date range
 */
export async function getAnnouncementMetrics(
  startDate: string,
  endDate: string
): Promise<{ data: AnnouncementMetrics | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const supabase = await createServerSupabaseClient();

    // Total published
    const { count: totalPublished } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    // Emergency broadcasts
    const { count: emergencyBroadcasts } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('priority', 'emergency')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    // Calculate engagement
    const { data: announcements } = await supabase
      .from('announcements')
      .select(
        `
        id,
        target_audience,
        target_houses,
        announcement_read_receipts (count)
      `
      )
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    let totalReached = 0;
    let totalReads = 0;

    if (announcements) {
      for (const announcement of announcements) {
        const targetCount = await calculateTargetCount(
          announcement.target_audience,
          announcement.target_houses
        );
        totalReached += targetCount;
        // @ts-ignore - count aggregation
        const readCount = announcement.announcement_read_receipts?.[0]?.count || 0;
        totalReads += readCount;
      }
    }

    const avgEngagementRate = totalReached > 0 ? (totalReads / totalReached) * 100 : 0;

    return {
      data: {
        totalPublished: totalPublished || 0,
        totalReached,
        avgEngagementRate: Math.round(avgEngagementRate * 10) / 10,
        emergencyBroadcasts: emergencyBroadcasts || 0,
      },
      error: null,
    };
  } catch (error) {
    console.error('Error getting announcement metrics:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get published announcement trend over time
 */
export async function getPublishedTrend(
  startDate: string,
  endDate: string,
  granularity: 'day' | 'week' | 'month' = 'month'
): Promise<{ data: TimeSeriesDataPoint[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: announcements } = await supabase
      .from('announcements')
      .select('published_at')
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate)
      .order('published_at');

    if (!announcements) {
      return { data: [], error: null };
    }

    // Group by time period
    const grouped = new Map<string, number>();

    announcements.forEach((a) => {
      const date = new Date(a.published_at);
      let key: string;

      if (granularity === 'month') {
        key = format(date, 'MMM yyyy');
      } else if (granularity === 'week') {
        key = `Week ${format(date, 'w, yyyy')}`;
      } else {
        key = format(date, 'MMM d');
      }

      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    const result: TimeSeriesDataPoint[] = Array.from(grouped.entries()).map(([label, value]) => ({
      label,
      value,
    }));

    return { data: result, error: null };
  } catch (error) {
    console.error('Error getting published trend:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get engagement by category
 */
export async function getCategoryEngagement(
  startDate: string,
  endDate: string
): Promise<{ data: CategoryEngagement[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: announcements } = await supabase
      .from('announcements')
      .select(
        `
        id,
        target_audience,
        target_houses,
        category:announcement_categories(name),
        announcement_read_receipts(count)
      `
      )
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    if (!announcements) {
      return { data: [], error: null };
    }

    // Group by category
    const categoryMap = new Map<
      string,
      { published: number; reads: number; targets: number }
    >();

    for (const announcement of announcements) {
      // @ts-ignore - category relation
      const categoryName = announcement.category?.name || 'Uncategorized';
      const targetCount = await calculateTargetCount(
        announcement.target_audience,
        announcement.target_houses
      );
      // @ts-ignore - count aggregation
      const readCount = announcement.announcement_read_receipts?.[0]?.count || 0;

      const existing = categoryMap.get(categoryName) || {
        published: 0,
        reads: 0,
        targets: 0,
      };
      categoryMap.set(categoryName, {
        published: existing.published + 1,
        reads: existing.reads + readCount,
        targets: existing.targets + targetCount,
      });
    }

    const result: CategoryEngagement[] = Array.from(categoryMap.entries())
      .map(([category_name, stats]) => ({
        category_name,
        total_published: stats.published,
        total_reads: stats.reads,
        engagement_rate:
          stats.targets > 0 ? Math.round((stats.reads / stats.targets) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.engagement_rate - a.engagement_rate);

    return { data: result, error: null };
  } catch (error) {
    console.error('Error getting category engagement:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get priority distribution
 */
export async function getPriorityDistribution(
  startDate: string,
  endDate: string
): Promise<{ data: PriorityDistribution[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: announcements } = await supabase
      .from('announcements')
      .select('priority')
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    if (!announcements) {
      return { data: [], error: null };
    }

    const counts = announcements.reduce((acc, a) => {
      const priority = a.priority || 'normal';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const total = announcements.length;

    const result: PriorityDistribution[] = Object.entries(counts)
      .map(([priority, count]) => ({
        priority,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return { data: result, error: null };
  } catch (error) {
    console.error('Error getting priority distribution:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get top performing announcements
 */
export async function getTopAnnouncements(
  startDate: string,
  endDate: string,
  limit: number = 10
): Promise<{ data: TopAnnouncement[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  try {
    const supabase = await createServerSupabaseClient();

    const { data: announcements } = await supabase
      .from('announcements')
      .select(
        `
        id,
        title,
        priority,
        published_at,
        target_audience,
        target_houses,
        category:announcement_categories(name),
        announcement_read_receipts(count)
      `
      )
      .eq('status', 'published')
      .gte('published_at', startDate)
      .lte('published_at', endDate);

    if (!announcements) {
      return { data: [], error: null };
    }

    const withEngagement = await Promise.all(
      announcements.map(async (a) => {
        const targetCount = await calculateTargetCount(a.target_audience, a.target_houses);
        // @ts-ignore - count aggregation
        const readCount = a.announcement_read_receipts?.[0]?.count || 0;
        const engagementRate =
          targetCount > 0 ? Math.round((readCount / targetCount) * 1000) / 10 : 0;

        return {
          id: a.id,
          title: a.title,
          // @ts-ignore - category relation
          category_name: a.category?.name || null,
          priority: a.priority || 'normal',
          published_at: a.published_at,
          read_count: readCount,
          target_count: targetCount,
          engagement_rate: engagementRate,
        };
      })
    );

    const sorted = withEngagement.sort((a, b) => b.engagement_rate - a.engagement_rate).slice(0, limit);

    return { data: sorted, error: null };
  } catch (error) {
    console.error('Error getting top announcements:', error);
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
