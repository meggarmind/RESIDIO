'use client';

import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from './date-range-filter';
import { useDateRange } from '@/hooks/use-date-range';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/**
 * Analytics Header Component
 *
 * Displays page title, date range filter, and manual refresh button.
 */
export function AnalyticsHeader() {
  const { preset, dateRange, setPreset, setCustomRange } = useDateRange();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['analytics'] });
    // Small delay for visual feedback
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="space-y-4">
      {/* Title Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Financial insights and occupancy metrics
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw
            className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
          />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Date Range Filter */}
      <DateRangeFilter
        preset={preset}
        dateRange={dateRange}
        onPresetChange={setPreset}
        onCustomRangeChange={setCustomRange}
      />
    </div>
  );
}
