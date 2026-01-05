'use client';

import { cn } from '@/lib/utils';

export interface ShimmerSkeletonProps {
  /**
   * Width of the skeleton
   * @default '100%'
   */
  width?: string | number;
  /**
   * Height of the skeleton
   * @default 20
   */
  height?: string | number;
  /**
   * Border radius
   * @default 'md'
   */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /**
   * Variant type
   * @default 'default'
   */
  variant?: 'default' | 'card' | 'avatar' | 'text';
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Speed of shimmer animation
   * @default 'normal'
   */
  speed?: 'slow' | 'normal' | 'fast';
}

const roundedMap = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

const variantMap = {
  default: '',
  card: 'min-h-[200px]',
  avatar: 'rounded-full',
  text: 'h-4 rounded',
};

const speedMap = {
  slow: 'shimmer-slow',
  normal: 'shimmer',
  fast: 'shimmer-fast',
};

/**
 * ShimmerSkeleton Component
 *
 * Enhanced skeleton loader with shimmer animation effect.
 * Provides visual feedback during content loading states.
 *
 * @example
 * <ShimmerSkeleton width={200} height={20} />
 * <ShimmerSkeleton variant="card" />
 * <ShimmerSkeleton variant="avatar" width={40} height={40} />
 * <ShimmerSkeleton variant="text" className="mb-2" />
 */
export function ShimmerSkeleton({
  width = '100%',
  height = 20,
  rounded = 'md',
  variant = 'default',
  className,
  speed = 'normal',
}: ShimmerSkeletonProps) {
  const widthValue = typeof width === 'number' ? `${width}px` : width;
  const heightValue = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        roundedMap[rounded],
        variantMap[variant],
        speedMap[speed],
        className
      )}
      style={{
        width: widthValue,
        height: heightValue,
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="shimmer-effect" />
    </div>
  );
}

/**
 * ShimmerLines Component
 *
 * Renders multiple shimmer skeleton lines for text placeholders.
 *
 * @example
 * <ShimmerLines count={3} />
 * <ShimmerLines count={5} gap={2} />
 */
export function ShimmerLines({
  count = 3,
  gap = 3,
  className,
}: {
  count?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-' + gap, className)}>
      {Array.from({ length: count }).map((_, index) => (
        <ShimmerSkeleton
          key={index}
          variant="text"
          width={index === count - 1 ? '80%' : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * ShimmerCard Component
 *
 * Pre-styled card skeleton with header and body.
 *
 * @example
 * <ShimmerCard />
 */
export function ShimmerCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShimmerSkeleton variant="avatar" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <ShimmerSkeleton width="60%" height={16} />
          <ShimmerSkeleton width="40%" height={12} />
        </div>
      </div>
      {/* Body */}
      <ShimmerLines count={4} />
    </div>
  );
}
