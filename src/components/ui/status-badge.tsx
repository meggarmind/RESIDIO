import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-200',
  {
    variants: {
      variant: {
        success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
        error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
        warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
        info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
        neutral: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

const dotVariants = cva('h-1.5 w-1.5 rounded-full', {
  variants: {
    variant: {
      success: 'bg-emerald-500',
      error: 'bg-red-500',
      warning: 'bg-amber-500',
      info: 'bg-blue-500',
      neutral: 'bg-gray-400',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  /**
   * Whether to show the colored dot indicator
   * @default true
   */
  showDot?: boolean;
  /**
   * Custom dot color (overrides variant)
   */
  dotColor?: string;
}

export function StatusBadge({
  variant,
  showDot = true,
  dotColor,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant }), className)} {...props}>
      {showDot && (
        <span
          className={cn(dotVariants({ variant }))}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
