import { cn } from '@/lib/utils';

interface ShimmerSkeletonProps {
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Show shimmer animation (defaults to true)
   */
  shimmer?: boolean;
}

/**
 * ShimmerSkeleton Component
 *
 * An enhanced skeleton loader with a professional shimmer animation effect.
 * Provides better perceived performance during data loading.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <ShimmerSkeleton className="h-8 w-48" />
 *
 * // Multiple skeletons
 * <div className="space-y-3">
 *   <ShimmerSkeleton className="h-12 w-full rounded-xl" />
 *   <ShimmerSkeleton className="h-12 w-full rounded-xl" />
 *   <ShimmerSkeleton className="h-12 w-full rounded-xl" />
 * </div>
 *
 * // Without shimmer (static)
 * <ShimmerSkeleton className="h-4 w-32" shimmer={false} />
 * ```
 */
export function ShimmerSkeleton({
  className,
  shimmer = true,
}: ShimmerSkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        className
      )}
    >
      {shimmer && (
        <div className="shimmer-animation absolute inset-0 -translate-x-full">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      )}
    </div>
  );
}

/**
 * Shimmer animation CSS
 * Add this to your global styles or include in Tailwind config
 */
export const shimmerStyles = `
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .shimmer-animation {
    animation: shimmer 2s infinite;
  }
`;
