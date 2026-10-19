"use client"

import * as React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface RecordSortOption {
  value: string
  label: string
}

interface RecordSortControlProps {
  options: RecordSortOption[]
  sortBy?: string
  sortOrder?: "asc" | "desc"
  /**
   * Same semantics as a table header click: a new column sorts ascending, the
   * current column flips the order.
   */
  onSort: (value: string) => void
  className?: string
}

/** Compact "Sort by" control that stands in for sortable table headers on phones. */
function RecordSortControl({ options, sortBy, sortOrder = "asc", onSort, className }: RecordSortControlProps) {
  const descending = sortOrder === "desc"
  const directionLabel = descending ? "Sort descending" : "Sort ascending"

  return (
    <div data-slot="record-sort-control" className={cn("flex items-center gap-2", className)}>
      <Select value={sortBy ?? ""} onValueChange={(value) => onSort(value)}>
        <SelectTrigger className="flex-1 min-h-11 md:min-h-0" aria-label="Sort by">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 md:size-9"
        aria-label={directionLabel}
        disabled={sortBy === undefined}
        onClick={() => {
          if (sortBy !== undefined) onSort(sortBy)
        }}
      >
        {descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
      </Button>
    </div>
  )
}

export { RecordSortControl }
export type { RecordSortControlProps, RecordSortOption }
