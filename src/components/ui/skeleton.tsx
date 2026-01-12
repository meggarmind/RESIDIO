import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
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
        "rounded-lg border bg-card p-6 space-y-4",
        className
      )}
      {...props}
    >
      {hasHeader && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {hasFooter && (
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      )}
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
}
