import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * RecordCard
 *
 * A stacked-card stand-in for a table row on phones. Presentational only:
 * the caller supplies every slot and owns every handler and permission gate.
 *
 * Slots: leading (e.g. a checkbox), title, badge (top right), subtitle,
 * children (body) and actions (footer buttons).
 *
 * When `onClick` is set the whole card is the tap target: it is a button for
 * assistive tech, reachable by keyboard, activated by Enter and Space, and at
 * least 44px tall. Clicks and key presses inside `leading` and `actions` never
 * reach `onClick`.
 */
const recordCardVariants = cva(
  "bg-card text-card-foreground flex flex-col gap-3 rounded-xl border border-border p-4 shadow-soft",
  {
    variants: {
      interactive: {
        true: "min-h-11 cursor-pointer transition-colors hover:bg-muted/50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        false: "",
      },
    },
    defaultVariants: {
      interactive: false,
    },
  }
)

type RecordCardEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>

interface RecordCardProps
  extends Omit<React.ComponentProps<"div">, "title" | "onClick">,
    Omit<VariantProps<typeof recordCardVariants>, "interactive"> {
  title: React.ReactNode
  badge?: React.ReactNode
  subtitle?: React.ReactNode
  leading?: React.ReactNode
  actions?: React.ReactNode
  /** Receives the originating event so callers can use `event.currentTarget`. */
  onClick?: (event: RecordCardEvent) => void
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation()

function RecordCard({
  title,
  badge,
  subtitle,
  leading,
  actions,
  onClick,
  className,
  children,
  ...props
}: RecordCardProps) {
  const interactive = typeof onClick === "function"

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Ignore keys that bubble up from a control inside the card.
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick?.(event)
    }
  }

  return (
    <div
      data-slot="record-card"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={cn(recordCardVariants({ interactive }), className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {leading ? (
          <div
            data-slot="record-card-leading"
            className="flex shrink-0 items-center self-center"
            onClick={stopPropagation}
            onKeyDown={stopPropagation}
          >
            {leading}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div data-slot="record-card-title" className="break-words font-medium text-foreground">
            {title}
          </div>
          {subtitle ? (
            <div data-slot="record-card-subtitle" className="mt-0.5 break-words text-xs text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
        {badge ? (
          <div data-slot="record-card-badge" className="shrink-0">
            {badge}
          </div>
        ) : null}
      </div>
      {children ? (
        <div data-slot="record-card-body" className="text-sm">
          {children}
        </div>
      ) : null}
      {actions ? (
        <div
          data-slot="record-card-actions"
          className="flex flex-wrap items-center justify-end gap-1 border-t border-border pt-2 empty:hidden"
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** Card-shaped loading placeholder, matching RecordCard's rhythm. */
function RecordCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="record-card-skeleton"
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <div className="flex justify-end gap-2 border-t border-border pt-2">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
      </div>
    </div>
  )
}

export { RecordCard, RecordCardSkeleton, recordCardVariants }
export type { RecordCardProps }
