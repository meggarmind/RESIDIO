'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { dateRangePresets } from '@/hooks/use-date-range';
import type { AnalyticsPreset, AnalyticsDateRange } from '@/types/analytics';
import type { DateRange } from 'react-day-picker';

interface DateRangeFilterProps {
  preset: AnalyticsPreset;
  dateRange: AnalyticsDateRange;
  onPresetChange: (preset: AnalyticsPreset) => void;
  onCustomRangeChange: (startDate: string, endDate: string) => void;
}

/**
 * Date Range Filter Component
 *
 * Provides preset buttons and custom date picker for analytics filtering.
 * Displays current date range for context.
 */
export function DateRangeFilter({
  preset,
  dateRange,
  onPresetChange,
  onCustomRangeChange,
}: DateRangeFilterProps) {
  const [customRange, setCustomRange] = useState<DateRange | undefined>(
    preset === 'custom'
      ? {
          from: new Date(dateRange.startDate),
          to: new Date(dateRange.endDate),
        }
      : undefined
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Handle preset selection
  const handlePresetClick = (newPreset: AnalyticsPreset) => {
    if (newPreset === 'custom') {
      setIsCalendarOpen(true);
    } else {
      onPresetChange(newPreset);
    }
  };

  // Handle custom range selection
  const handleCustomRangeSelect = (range: DateRange | undefined) => {
    setCustomRange(range);

    if (range?.from && range?.to) {
      onCustomRangeChange(
        format(range.from, 'yyyy-MM-dd'),
        format(range.to, 'yyyy-MM-dd')
      );
      setIsCalendarOpen(false);
    }
  };

  // Format the current range for display
  const formatDateRange = () => {
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);

    // Same month and year
    if (
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    ) {
      return format(start, 'MMMM yyyy');
    }

    // Same year
    if (start.getFullYear() === end.getFullYear()) {
      return `${format(start, 'MMM')} - ${format(end, 'MMM yyyy')}`;
    }

    // Different years
    return `${format(start, 'MMM yyyy')} - ${format(end, 'MMM yyyy')}`;
  };

  return (
    <div className="space-y-3">
      {/* Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        {dateRangePresets
          .filter((p) => p.value !== 'custom')
          .map((presetOption) => (
            <Button
              key={presetOption.value}
              variant={preset === presetOption.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePresetClick(presetOption.value)}
              className="text-xs"
            >
              {presetOption.label}
            </Button>
          ))}

        {/* Custom Date Picker */}
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={preset === 'custom' ? 'default' : 'outline'}
              size="sm"
              className={cn('text-xs gap-1.5')}
            >
              <Calendar className="h-3.5 w-3.5" />
              Custom
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarComponent
              mode="range"
              defaultMonth={customRange?.from || new Date()}
              selected={customRange}
              onSelect={handleCustomRangeSelect}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Current Range Display */}
      <p className="text-sm text-muted-foreground">
        Showing data for: <span className="font-medium">{formatDateRange()}</span>
      </p>
    </div>
  );
}
