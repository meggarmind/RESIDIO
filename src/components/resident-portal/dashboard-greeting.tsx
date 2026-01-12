import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Dashboard Greeting Component - Modern Design System
 *
 * Large welcoming greeting section for the dashboard page with name and subtitle.
 *
 * Design Specifications:
 * - Greeting: 36px bold (var(--text-4xl))
 * - Subtitle: 14px gray (var(--text-sm))
 * - Spacing: 8px gap between lines
 * - Color: Primary text for greeting, secondary for subtitle
 * - Margin bottom: 32px (var(--space-8))
 *
 * Example:
 * "Hello Turja, Good Morning" (36px)
 * "Let's check your asset" (14px gray)
 *
 * Usage:
 * <DashboardGreeting
 *   userName="Turja"
 *   greeting="Good Morning"
 *   subtitle="Let's check your asset"
 * />
 */

interface DashboardGreetingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** User's first name or full name */
  userName: string;
  /** Time-based greeting (e.g., "Good Morning", "Good Afternoon") */
  greeting: string;
  /** Optional subtitle text */
  subtitle?: string;
}

export function DashboardGreeting({
  userName,
  greeting,
  subtitle = "Let's check your asset",
  className,
  ...props
}: DashboardGreetingProps) {
  return (
    <div
      className={cn('dashboard-greeting', className)}
      style={{
        marginBottom: 'var(--space-8)', // 32px
      }}
      {...props}
    >
      {/* Main Greeting */}
      <h1
        style={{
          fontSize: 'var(--text-4xl)', // 36px
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-text-primary)',
          lineHeight: 'var(--leading-4xl)',
          marginBottom: 'var(--space-2)', // 8px
        }}
      >
        Hello {userName}, {greeting}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            fontSize: 'var(--text-sm)', // 14px
            color: 'var(--color-text-secondary)',
            lineHeight: 'var(--leading-sm)',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
