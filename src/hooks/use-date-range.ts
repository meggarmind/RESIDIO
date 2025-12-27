'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { AnalyticsPreset, AnalyticsDateRange } from '@/types/analytics';

/**
 * Hook for managing URL-based date range state
 *
 * Provides shareable URLs by storing date range in search params.
 * Supports preset options and custom date ranges.
 */
export function useDateRange() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current preset from URL or default to 'this_month'
  const preset = (searchParams.get('preset') as AnalyticsPreset) || 'this_month';

  // Get custom dates from URL (only used when preset is 'custom')
  const customStartDate = searchParams.get('startDate') || '';
  const customEndDate = searchParams.get('endDate') || '';

  // Calculate date range based on preset
  const dateRange = useMemo((): AnalyticsDateRange => {
    if (preset === 'custom' && customStartDate && customEndDate) {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
        preset: 'custom',
      };
    }

    const { startDate, endDate } = getDateRangeFromPreset(preset);
    return { startDate, endDate, preset };
  }, [preset, customStartDate, customEndDate]);

  // Set preset (updates URL)
  const setPreset = useCallback(
    (newPreset: AnalyticsPreset) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('preset', newPreset);

      // Clear custom dates when switching to a preset
      if (newPreset !== 'custom') {
        params.delete('startDate');
        params.delete('endDate');
      }

      router.push(`/analytics?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Set custom date range
  const setCustomRange = useCallback(
    (startDate: string, endDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('preset', 'custom');
      params.set('startDate', startDate);
      params.set('endDate', endDate);

      router.push(`/analytics?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return {
    preset,
    dateRange,
    setPreset,
    setCustomRange,
  };
}

/**
 * Calculate date range from preset
 *
 * Replicates logic from src/lib/validators/reports.ts
 */
function getDateRangeFromPreset(preset: AnalyticsPreset): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (preset) {
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'last_quarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
      const yearAdjust = lastQuarter < 0 ? -1 : 0;
      const adjustedQuarter = lastQuarter < 0 ? 3 : lastQuarter;
      startDate = new Date(now.getFullYear() + yearAdjust, adjustedQuarter * 3, 1);
      endDate = new Date(now.getFullYear() + yearAdjust, (adjustedQuarter + 1) * 3, 0);
      break;
    case 'ytd':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    case 'last_year':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31);
      break;
    default:
      // Default to this month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Preset options for the date range filter
 */
export const dateRangePresets: Array<{ value: AnalyticsPreset; label: string }> = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];
