import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncementAnalyticsData } from '@/hooks/use-announcement-analytics';

const analyticsState = vi.hoisted(() => ({
  current: {} as {
    data?: AnnouncementAnalyticsData;
    isLoading: boolean;
    error: Error | null;
  },
}));

vi.mock('next/dynamic', async () => {
  const [trend, category, priority, top] = await Promise.all([
    import('@/components/analytics/announcements/published-trend-chart'),
    import('@/components/analytics/announcements/category-engagement-chart'),
    import('@/components/analytics/announcements/priority-distribution-chart'),
    import('@/components/analytics/announcements/top-announcements-table'),
  ]);
  const components = [
    ['published-trend-chart', trend.PublishedTrendChart],
    ['category-engagement-chart', category.CategoryEngagementChart],
    ['priority-distribution-chart', priority.PriorityDistributionChart],
    ['top-announcements-table', top.TopAnnouncementsTable],
  ] as const;

  return {
    default: (loader: () => Promise<unknown>) => {
      const requestedModule = loader.toString();
      const match = components.find(([moduleName]) => requestedModule.includes(moduleName));
      if (!match) throw new Error(`Unexpected dynamic analytics component: ${requestedModule}`);
      return match[1];
    },
  };
});

vi.mock('@/hooks/use-date-range', () => ({
  useDateRange: () => ({
    dateRange: { startDate: '2026-08-01', endDate: '2026-08-31' },
    preset: 'this_month',
    setPreset: vi.fn(),
    setCustomRange: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-announcement-analytics', () => ({
  useAnnouncementAnalytics: () => analyticsState.current,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/components/analytics/date-range-filter', () => ({
  DateRangeFilter: () => <div>Date range</div>,
}));

import { AnnouncementAnalyticsClient } from '@/app/(dashboard)/analytics/announcements/analytics-client';

const emptyAnalytics: AnnouncementAnalyticsData = {
  metrics: {
    totalPublished: 0,
    totalReached: 0,
    avgEngagementRate: 0,
    emergencyBroadcasts: 0,
  },
  publishedTrend: [],
  categoryEngagement: [],
  priorityDistribution: [],
  topAnnouncements: [],
};

function renderDashboard(): string {
  return renderToStaticMarkup(<AnnouncementAnalyticsClient />);
}

describe('announcement analytics data states', () => {
  beforeEach(() => {
    analyticsState.current = { data: emptyAnalytics, isLoading: false, error: null };
  });

  it('renders zero metrics and meaningful empty messages when no announcements exist', () => {
    const markup = renderDashboard();

    expect(markup).toMatch(/Total Published[\s\S]*?>0</);
    expect(markup).toMatch(/Total Reached[\s\S]*?>0</);
    expect(markup).toMatch(/Avg Engagement[\s\S]*?>0\.0%?</);
    expect(markup).toMatch(/Emergency Alerts[\s\S]*?>0</);
    expect(markup.match(/No announcement data available/g)).toHaveLength(2);
    expect(markup).toContain('No category data available');
    expect(markup).toContain('No priority data available');
  });

  it('does not label populated analytics as empty', () => {
    analyticsState.current = {
      data: {
        metrics: {
          totalPublished: 1,
          totalReached: 20,
          avgEngagementRate: 75,
          emergencyBroadcasts: 1,
        },
        publishedTrend: [{ label: 'Aug 2026', value: 1 }],
        categoryEngagement: [
          { category_name: 'Community', total_published: 1, total_reads: 15, engagement_rate: 75 },
        ],
        priorityDistribution: [{ priority: 'normal', count: 1, percentage: 100 }],
        topAnnouncements: [
          {
            id: 'announcement-1',
            title: 'Estate meeting',
            category_name: 'Community',
            priority: 'normal',
            published_at: '2026-08-12T10:00:00.000Z',
            read_count: 15,
            target_count: 20,
            engagement_rate: 75,
          },
        ],
      },
      isLoading: false,
      error: null,
    };

    const markup = renderDashboard();

    expect(markup).not.toContain('No announcement data available');
    expect(markup).not.toContain('No category data available');
    expect(markup).not.toContain('No priority data available');
    expect(markup).toContain('Estate meeting');
  });

  it('does not show empty messages while analytics are loading', () => {
    analyticsState.current = { data: undefined, isLoading: true, error: null };

    const markup = renderDashboard();

    expect(markup).not.toContain('No announcement data available');
    expect(markup).not.toContain('No category data available');
    expect(markup).not.toContain('No priority data available');
    expect(markup).not.toContain('Last updated:');
  });

  it('shows the request error without also claiming the result is empty', () => {
    analyticsState.current = {
      data: undefined,
      isLoading: false,
      error: new Error('Analytics request failed'),
    };

    const markup = renderDashboard();

    expect(markup).toContain('Error loading analytics');
    expect(markup).toContain('Analytics request failed');
    expect(markup).not.toContain('No announcement data available');
    expect(markup).not.toContain('No category data available');
    expect(markup).not.toContain('No priority data available');
  });
});
