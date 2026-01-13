import { cn } from "@/lib/utils"

interface SkeletonProps extends React.ComponentProps<"div"> {
  variant?: "default" | "shimmer" | "pulse";
}

function Skeleton({ className, variant = "shimmer", ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md",
        variant === "default" && "bg-accent animate-pulse",
        variant === "shimmer" && "skeleton-shimmer",
        variant === "pulse" && "bg-accent animate-pulse-soft",
        className
      )}
      {...props}
    />
  )
}

interface SkeletonTextProps extends React.ComponentProps<"div"> {
  lines?: number;
  lastLineWidth?: "full" | "3/4" | "1/2" | "1/4";
}

function SkeletonText({
  className,
  lines = 3,
  lastLineWidth = "3/4",
  ...props
}: SkeletonTextProps) {
  const widthClass = {
    full: "w-full",
    "3/4": "w-3/4",
    "1/2": "w-1/2",
    "1/4": "w-1/4",
  }[lastLineWidth];

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? widthClass : "w-full"
          )}
        />
      ))}
    </div>
  )
}

interface SkeletonAvatarProps extends React.ComponentProps<"div"> {
  size?: "sm" | "md" | "lg" | "xl";
}

function SkeletonAvatar({
  className,
  size = "md",
  ...props
}: SkeletonAvatarProps) {
  const sizeClass = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  }[size];

  return (
    <Skeleton
      className={cn("rounded-full", sizeClass, className)}
      {...props}
    />
  )
}

interface SkeletonCardProps extends React.ComponentProps<"div"> {
  hasHeader?: boolean;
  hasFooter?: boolean;
}

function SkeletonCard({
  className,
  hasHeader = true,
  hasFooter = false,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 space-y-4 shadow-soft animate-slide-up",
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/3 rounded-lg" />
          <Skeleton className="h-4 w-2/3 rounded-md" />
        </div>
      )}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
      </div>
      {hasFooter && (
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      )}
    </div>
  )
}

/**
 * Modern stat card skeleton for dashboard
 */
function SkeletonStatCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 shadow-soft animate-slide-up",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg mb-2" />
      <Skeleton className="h-3 w-32 rounded-md" />
    </div>
  )
}

/**
 * Modern dashboard skeleton with multiple cards
 */
function SkeletonDashboard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-6", className)} {...props}>
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-5 w-80 rounded-md" />
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonStatCard key={i} className={`stagger-${i}`} />
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-[300px] stagger-5" />
        <SkeletonCard className="h-[300px] stagger-6" />
      </div>
    </div>
  )
}

/**
 * Modern page loading skeleton
 */
function SkeletonPage({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-6", className)} {...props}>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-4 w-64 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
        {/* Table header */}
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 flex-1 rounded-md" />
            ))}
          </div>
        </div>
        {/* Table rows */}
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className={`px-4 py-4 border-b last:border-b-0 stagger-${row}`}>
            <div className="flex gap-4 items-center">
              <Skeleton className="h-8 w-8 rounded-lg" />
              {[1, 2, 3, 4].map((col) => (
                <Skeleton key={col} className="h-4 flex-1 rounded-md" />
              ))}
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface SkeletonTableRowProps extends React.ComponentProps<"div"> {
  columns?: number;
}

function SkeletonTableRow({
  className,
  columns = 4,
  ...props
}: SkeletonTableRowProps) {
  return (
    <div
      className={cn("flex items-center gap-4 py-3", className)}
      {...props}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-8" : i === columns - 1 ? "w-16" : "flex-1"
          )}
        />
      ))}
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonStatCard,
  SkeletonDashboard,
  SkeletonPage,
}
