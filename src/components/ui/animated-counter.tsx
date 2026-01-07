'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  value: number;
  /** Animation duration in ms. Default: 500ms (PERFORMANCE: reduced from 1000ms) */
  duration?: number;
  className?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  formatNumber?: boolean;
  /** Custom formatter function. If provided, overrides prefix/suffix/decimals/formatNumber */
  formatter?: (value: number) => string;
  /** Skip animation and show final value immediately */
  skipAnimation?: boolean;
}

// Check for reduced motion preference (cached for performance)
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * AnimatedCounter Component
 *
 * Animates counting from 0 to target value on mount or value change.
 * Uses requestAnimationFrame for smooth 60fps animation.
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Default duration reduced from 1000ms to 500ms for faster perceived load
 * - Respects prefers-reduced-motion for accessibility and performance
 * - skipAnimation prop for programmatic control
 *
 * @example
 * <AnimatedCounter value={1234} formatNumber prefix="$" />
 * // Outputs: $1,234
 *
 * @example
 * <AnimatedCounter value={85.5} decimals={1} suffix="%" />
 * // Outputs: 85.5%
 */
export function AnimatedCounter({
  value,
  duration = 500, // PERFORMANCE: Reduced from 1000ms
  className,
  decimals = 0,
  prefix = '',
  suffix = '',
  formatNumber = false,
  formatter,
  skipAnimation = false,
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // PERFORMANCE: Skip animation if user prefers reduced motion or skipAnimation is set
    if (skipAnimation || prefersReducedMotion()) {
      setDisplayValue(value);
      return;
    }

    // Reset animation when value changes
    setDisplayValue(0);
    startTimeRef.current = undefined;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);

      // Easing function: easeOutQuart for smooth deceleration
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);

      const currentValue = value * easeOutQuart;
      setDisplayValue(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration, skipAnimation]);

  const formatValue = (num: number): string => {
    const fixed = num.toFixed(decimals);

    if (formatNumber) {
      // Add thousand separators
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }

    return fixed;
  };

  return (
    <span className={cn('font-variant-numeric tabular-nums', className)}>
      {formatter ? formatter(displayValue) : `${prefix}${formatValue(displayValue)}${suffix}`}
    </span>
  );
}
