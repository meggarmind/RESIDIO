'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  /**
   * The target value to count up to
   */
  value: number;
  /**
   * Optional starting value (defaults to 0)
   */
  from?: number;
  /**
   * Animation duration in seconds (defaults to 1)
   */
  duration?: number;
  /**
   * Number of decimal places to display (defaults to 0)
   */
  decimals?: number;
  /**
   * Optional prefix (e.g., "$", "₦")
   */
  prefix?: string;
  /**
   * Optional suffix (e.g., "%", "K", "M")
   */
  suffix?: string;
  /**
   * Optional custom formatter function
   */
  formatter?: (value: number) => string;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Delay before animation starts in seconds (defaults to 0)
   */
  delay?: number;
}

/**
 * AnimatedCounter Component
 *
 * A reusable component that animates numbers with a smooth count-up effect.
 * Uses framer-motion for spring-based animations that feel natural and responsive.
 *
 * @example
 * ```tsx
 * // Currency counter
 * <AnimatedCounter value={1500.50} decimals={2} prefix="₦" />
 *
 * // Percentage
 * <AnimatedCounter value={75} suffix="%" />
 *
 * // Custom formatter
 * <AnimatedCounter
 *   value={1000000}
 *   formatter={(val) => formatCurrency(val)}
 * />
 * ```
 */
export function AnimatedCounter({
  value,
  from = 0,
  duration = 1,
  decimals = 0,
  prefix = '',
  suffix = '',
  formatter,
  className,
  delay = 0,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  });
  const displayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Apply delay before starting animation
    const timer = setTimeout(() => {
      motionValue.set(value);
    }, delay * 1000);

    return () => clearTimeout(timer);
  }, [value, delay, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on('change', (latest) => {
      if (displayRef.current) {
        let displayValue: string;

        if (formatter) {
          // Use custom formatter
          displayValue = formatter(latest);
        } else {
          // Default formatting with decimals
          displayValue = latest.toFixed(decimals);
        }

        displayRef.current.textContent = `${prefix}${displayValue}${suffix}`;
      }
    });

    return () => unsubscribe();
  }, [springValue, decimals, prefix, suffix, formatter]);

  return (
    <motion.span
      ref={displayRef}
      className={cn('tabular-nums', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {prefix}{from.toFixed(decimals)}{suffix}
    </motion.span>
  );
}
