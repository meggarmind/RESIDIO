'use client';

import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { SearchAnalyticsCard } from '@/components/analytics/search-analytics-card';
import { useSearchAnalytics } from '@/hooks/use-search-analytics';

// Trailing 90-day window. The sibling analytics tabs (Residents, Houses &
// Streets, Collections, Payment Behavior) query all-time snapshots with no
// date range at all, but getSearchAnalytics requires an explicit
// startDate/endDate. 90 days is wide enough to surface admin search behavior
// between periodic reviews without an all-time scan of search_logs.
const SEARCH_ANALYTICS_WINDOW_DAYS = 90;

export function SearchTab() {
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = subDays(end, SEARCH_ANALYTICS_WINDOW_DAYS);
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    };
  }, []);

  const { data, isLoading } = useSearchAnalytics({ startDate, endDate });

  // On an unauthorized/failed fetch, `data` stays undefined and `isLoading`
  // settles to false; SearchAnalyticsCard already renders null when it has
  // no data, so this degrades to an empty tab instead of an error boundary.
  return (
    <div className="space-y-6">
      <SearchAnalyticsCard
        topSearches={data?.topSearches}
        zeroResultSearches={data?.zeroResultSearches}
        isLoading={isLoading}
      />
    </div>
  );
}
