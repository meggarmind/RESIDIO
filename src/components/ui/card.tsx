import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Card Variant System
 *
 * Provides consistent card styling across the application:
 *
 * - default: Standard padding (py-6) for forms, settings, detail sections
 * - stat: Compact padding (py-4) for KPI cards, metrics displays
 * - list: No padding (py-0) for cards containing scrollable lists
 * - featured: Compact padding with gradient support for hero/featured content
 * - compact: Minimal padding (py-3) for dense grid layouts
 */
const cardVariants = cva(
  "bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm",
  {
    variants: {
      variant: {
        default: "gap-6 py-6",
        stat: "gap-3 py-4",
        list: "gap-0 py-0",
        featured: "gap-3 py-4",
        compact: "gap-2 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {
  interactive?: boolean
}

function Card({ className, variant, interactive = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ variant }),
        interactive && "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}
