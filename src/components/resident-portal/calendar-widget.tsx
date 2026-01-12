'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Calendar Widget Component - Modern Design System
 *
 * Mini calendar widget for the right sidebar showing current month with day selection.
 *
 * Design Specifications:
 * - Grid: 7 columns (Su-Sa)
 * - Day cells: 32x32px, rounded
 * - Active day: Primary color background, white text
 * - Today: Border with primary color
 * - Hover: Light gray background
 * - Header: Month/Year with navigation arrows
 * - Font size: 12px (var(--text-xs))
 *
 * Example:
 * [< September 2024 >]
 * Su Mo Tu We Th Fr Sa
 * 1  2  3  4  5  6  7
 * 8  9 [10] 11 12 13 14
 *
 * Usage:
 * <CalendarWidget
 *   selectedDate={new Date()}
 *   onDateSelect={(date) => console.log(date)}
 * />
 */

interface CalendarWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Currently selected date */
  selectedDate?: Date;
  /** Callback when a date is selected */
  onDateSelect?: (date: Date) => void;
}

export function CalendarWidget({
  selectedDate,
  onDateSelect,
  className,
  ...props
}: CalendarWidgetProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    selectedDate || new Date()
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get first day of month and number of days
  const firstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  );
  const lastDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  );
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

  // Month navigation
  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  // Format month and year
  const monthYear = currentMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Generate calendar days
  const days = [];
  // Empty cells before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} />);
  }
  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const isToday = (day: number) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day
    );
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day
    );
    const selected = new Date(selectedDate);
    date.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);
    return date.getTime() === selected.getTime();
  };

  const handleDayClick = (day: number) => {
    if (onDateSelect) {
      const date = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        day
      );
      onDateSelect(date);
    }
  };

  return (
    <div className={cn('card', className)} {...props}>
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={previousMonth}
          style={{
            width: '28px',
            height: '28px',
          }}
        >
          <ChevronLeft
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-secondary)',
            }}
          />
        </Button>

        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          {monthYear}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={nextMonth}
          style={{
            width: '28px',
            height: '28px',
          }}
        >
          <ChevronRight
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-secondary)',
            }}
          />
        </Button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((name) => (
          <div
            key={name}
            className="flex items-center justify-center"
            style={{
              height: '28px',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-text-muted)',
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (typeof day !== 'number') {
            // Empty cell
            return <div key={`empty-${index}`} />;
          }

          const selected = isSelected(day);
          const today = isToday(day);

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className={cn(
                'calendar-day',
                'flex items-center justify-center transition-all duration-150',
                selected && 'calendar-day-selected',
                today && !selected && 'calendar-day-today'
              )}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                background: selected
                  ? 'var(--color-primary)'
                  : 'transparent',
                color: selected
                  ? '#FFFFFF'
                  : 'var(--color-text-primary)',
                border: today && !selected
                  ? '1px solid var(--color-primary)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!selected) {
                  e.currentTarget.style.background = 'var(--color-bg-input)';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
