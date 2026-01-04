'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /**
   * Progress value (0-100)
   */
  progress: number;
  /**
   * Size of the ring in pixels (defaults to 48)
   */
  size?: number;
  /**
   * Stroke width in pixels (defaults to 4)
   */
  strokeWidth?: number;
  /**
   * Color of the progress stroke (defaults to 'hsl(var(--primary))')
   */
  color?: string;
  /**
   * Color of the background track (defaults to 'hsl(var(--muted))')
   */
  trackColor?: string;
  /**
   * Show percentage text in the center
   */
  showValue?: boolean;
  /**
   * Custom content to display in the center
   */
  children?: React.ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Animation duration in seconds (defaults to 1)
   */
  duration?: number;
}

/**
 * ProgressRing Component
 *
 * A circular progress indicator with smooth animations.
 * Perfect for showing completion percentages, wallet balance ratios, etc.
 *
 * @example
 * ```tsx
 * // Simple progress ring
 * <ProgressRing progress={75} />
 *
 * // Custom size and colors
 * <ProgressRing
 *   progress={60}
 *   size={64}
 *   strokeWidth={6}
 *   color="hsl(142, 76%, 36%)"
 * />
 *
 * // With custom content
 * <ProgressRing progress={85}>
 *   <span className="text-sm font-bold">85%</span>
 * </ProgressRing>
 * ```
 */
export function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  color = 'hsl(var(--primary))',
  trackColor = 'hsl(var(--muted))',
  showValue = false,
  children,
  className,
  duration = 1,
}: ProgressRingProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate circle properties
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  // Center position
  const center = size / 2;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: isClient ? offset : circumference,
          }}
          transition={{
            duration,
            ease: 'easeInOut',
          }}
        />
      </svg>

      {/* Center content */}
      {(showValue || children) && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children || (
            <span className="text-xs font-medium tabular-nums">
              {Math.round(progress)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
