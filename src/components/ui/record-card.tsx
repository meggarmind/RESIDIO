import * as React from "react"
import { cva } from "class-variance-authority"

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
 * When `onClick` is set the card is tappable through one real, full-bleed
 * <button> (the hit area) that sits BEHIND the content. The card root is not
 * itself a button, so the links, buttons and checkbox inside it stay exposed
 * to assistive tech and are never nested in another interactive element.
 * Non-interactive content lets taps fall through to the hit area
 * (`pointer-events-none`); real controls opt back in.
 */
const recordCardVariants = cva(
  "relative bg-card text-card-foreground flex flex-col gap-3 rounded-xl border border-border p-4 shadow-soft",
  {
    variants: {
      interactive: {
        true: "min-h-11 transition-colors hover:bg-muted/50",
        false: "",
      },
    },
    defaultVariants: {
      interactive: false,
    },
  }
)

// Content sits above the hit area and ignores pointer events, so a tap on text
// reaches the hit area. Real controls (and Radix triggers such as the tooltip
// badge and checkbox, which carry data-state) opt back in.
const CONTENT_LAYER = "relative z-10 pointer-events-none"
const CONTROLS_ENABLED =
  "[&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_[role=checkbox]]:pointer-events-auto [&_[data-state]]:pointer-events-auto"

interface RecordCardBaseProps extends Omit<React.ComponentProps<"div">, "title" | "onClick"> {
  title: React.ReactNode
  badge?: React.ReactNode
  subtitle?: React.ReactNode
  leading?: React.ReactNode
  actions?: React.ReactNode
}

type RecordCardInteraction =
  | {
      /**
       * Called when the hit-area button is activated (tap, Enter or Space).
       * `card` is the card root element, for callers that need to name it
       * (for example a view transition), rather than the button.
       */
      onClick: (event: React.MouseEvent<HTMLButtonElement>, card: HTMLElement) => void
      /** Accessible name of the hit-area button, for example "Open Ada Obi". */
      label: string
    }
  | { onClick?: undefined; label?: string }

type RecordCardProps = RecordCardBaseProps & RecordCardInteraction

function RecordCard({
  title,
  badge,
  subtitle,
  leading,
  actions,
  onClick,
  label,
  className,
  children,
  ...props
}: RecordCardProps) {
  const interactive = typeof onClick === "function"

  return (
    <div
      data-slot="record-card"
      className={cn(recordCardVariants({ interactive }), className)}
      {...props}
    >
      {interactive ? (
        <button
          type="button"
          data-slot="record-card-hit-area"
          aria-label={label}
          className="absolute inset-0 cursor-pointer rounded-xl bg-transparent outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border focus-visible:border-ring"
          onClick={(event) => onClick?.(event, event.currentTarget.parentElement as HTMLElement)}
        />
      ) : null}
      <div className={cn("flex items-start gap-3", interactive && CONTENT_LAYER, interactive && CONTROLS_ENABLED)}>
        {leading ? (
          <div
            data-slot="record-card-leading"
            className={cn("flex shrink-0 items-center self-center", interactive && "pointer-events-auto")}
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
        <div
          data-slot="record-card-body"
          className={cn("text-sm", interactive && CONTENT_LAYER, interactive && CONTROLS_ENABLED)}
        >
          {children}
        </div>
      ) : null}
      {actions ? (
        <div
          data-slot="record-card-actions"
          className={cn(
            "flex flex-wrap items-center justify-end gap-1 border-t border-border pt-2 empty:hidden",
            interactive && CONTENT_LAYER,
            interactive && CONTROLS_ENABLED
          )}
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
