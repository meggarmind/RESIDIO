"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RecordCardSkeleton } from "@/components/ui/record-card"
import { RecordSortControl, type RecordSortOption } from "@/components/ui/record-sort-control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SortOrder = "asc" | "desc"

interface DataTableSort {
  key: string
  order: SortOrder
}

interface DataTableColumn<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  /** Hide the column below this breakpoint. */
  hideBelow?: "lg" | "xl"
  /** The record identifier. Pinned to the left edge while the table scrolls sideways. */
  identifier?: boolean
  cell: (row: T) => React.ReactNode
}

interface DataTablePagination {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

interface DataTableSelection {
  selectedKeys: string[]
  onSelectedKeysChange: (keys: string[]) => void
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  isLoading?: boolean
  error?: Error | null
  emptyState: React.ReactNode
  sort?: DataTableSort
  onSortChange?: (sort: DataTableSort) => void
  pagination: DataTablePagination
  onRowClick?: (row: T, element: HTMLElement, event: React.MouseEvent) => void
  /** Called with each table row element, for callers that name it (for example a view transition). */
  rowRef?: (row: T, element: HTMLTableRowElement | null) => void
  /** Content of the last, right aligned "Actions" column. Clicks in it never open the row. */
  actions?: (row: T) => React.ReactNode
  /** Stacked card shown below md in place of the table. Both lists stay in the DOM. */
  renderCard?: (row: T) => React.ReactNode
  /** Phone sort choices. Defaults to the sortable columns. */
  sortOptions?: RecordSortOption[]
  selection?: DataTableSelection
  /** Plural noun for the footer and the error message, for example "residents". */
  itemLabel?: string
  pageSizeOptions?: number[]
  cardListTestId?: string
}

const HIDE_BELOW = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const

const SKELETON_ROWS = 5

// Same semantics as a header click: a new column sorts ascending, the current one flips.
function nextSort(current: DataTableSort | undefined, key: string): DataTableSort {
  if (current?.key === key) return { key, order: current.order === "asc" ? "desc" : "asc" }
  return { key, order: "asc" }
}

function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  error,
  emptyState,
  sort,
  onSortChange,
  pagination,
  onRowClick,
  rowRef,
  actions,
  renderCard,
  sortOptions,
  selection,
  itemLabel = "records",
  pageSizeOptions = [10, 20, 50],
  cardListTestId,
}: DataTableProps<T>) {
  const { page, pageSize, totalCount, onPageChange, onPageSizeChange } = pagination
  const columnCount = columns.length + (actions ? 1 : 0) + (selection ? 1 : 0)
  const isEmpty = !!rows && rows.length === 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const handleSort = (key: string) => {
    onSortChange?.(nextSort(sort, key))
    onPageChange(1)
  }

  const phoneSortOptions =
    sortOptions ?? columns.filter((c) => c.sortable).map((c) => ({ value: c.key, label: c.header }))

  const pageKeys = (rows ?? []).map(rowKey)
  const selectedOnPage = selection ? pageKeys.filter((k) => selection.selectedKeys.includes(k)) : []
  const allSelected = pageKeys.length > 0 && selectedOnPage.length === pageKeys.length

  const toggleKey = (key: string, checked: boolean) => {
    if (!selection) return
    const others = selection.selectedKeys.filter((k) => k !== key)
    selection.onSelectedKeysChange(checked ? [...others, key] : others)
  }

  const togglePage = (checked: boolean) => {
    if (!selection) return
    const others = selection.selectedKeys.filter((k) => !pageKeys.includes(k))
    selection.onSelectedKeysChange(checked ? [...others, ...pageKeys] : others)
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive" role="alert">
        Error loading {itemLabel}: {error.message}
      </div>
    )
  }

  const columnClass = (column: DataTableColumn<T>) =>
    cn(column.hideBelow && HIDE_BELOW[column.hideBelow], column.className)

  // The pinned cell needs its own opaque background or the scrolled columns show through it.
  const identifierClass = (column: DataTableColumn<T>) =>
    column.identifier ? "sticky left-0 bg-background" : undefined

  return (
    <div className="space-y-4">
      {renderCard && (
        <div className="space-y-3 md:hidden" data-testid={cardListTestId}>
          <RecordSortControl
            options={phoneSortOptions}
            sortBy={sort?.key}
            sortOrder={sort?.order}
            onSort={handleSort}
          />
          {isLoading ? (
            [...Array(SKELETON_ROWS)].map((_, i) => <RecordCardSkeleton key={i} />)
          ) : isEmpty ? (
            <div className="rounded-xl border bg-card py-12 shadow-soft">{emptyState}</div>
          ) : (
            rows?.map((row) => <React.Fragment key={rowKey(row)}>{renderCard(row)}</React.Fragment>)
          )}
        </div>
      )}

      <div
        className={cn(
          "rounded-xl border overflow-hidden shadow-soft animate-slide-up",
          renderCard && "hidden md:block"
        )}
      >
        <Table variant="modern">
          <TableHeader sticky>
            <TableRow interactive={false}>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allSelected ? true : selectedOnPage.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => togglePage(checked === true)}
                  />
                </TableHead>
              )}
              {columns.map((column) => {
                const active = sort?.key === column.key
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      column.sortable ? (active ? (sort?.order === "asc" ? "ascending" : "descending") : "none") : undefined
                    }
                    className={cn(columnClass(column), identifierClass(column))}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.header}
                        {active ? (
                          sort?.order === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                )
              })}
              {actions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(SKELETON_ROWS)].map((_, i) => (
                <TableRow key={i}>
                  {selection && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn(columnClass(column), identifierClass(column))}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : isEmpty ? (
              <TableRow interactive={false}>
                <TableCell colSpan={columnCount} className="py-12">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              rows?.map((row) => {
                const key = rowKey(row)
                return (
                  <TableRow
                    key={key}
                    ref={rowRef ? (element) => rowRef(row, element) : undefined}
                    interactive={!!onRowClick}
                    className={onRowClick ? undefined : "cursor-default"}
                    onClick={onRowClick ? (event) => onRowClick(row, event.currentTarget, event) : undefined}
                  >
                    {selection && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label="Select row"
                          checked={selection.selectedKeys.includes(key)}
                          onCheckedChange={(checked) => toggleKey(key, checked === true)}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.key} className={cn(columnClass(column), identifierClass(column))}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                          {actions(row)}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  onPageSizeChange(Number(value))
                  onPageChange(1)
                }}
              >
                <SelectTrigger className="h-8 w-[70px] rounded-xl" aria-label="Rows per page">
                  <SelectValue placeholder={pageSize.toString()} />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} {itemLabel}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="h-9 w-9 p-0"
            >
              <span className="sr-only">Previous page</span>
              <ChevronDown className="h-4 w-4 rotate-90" />
            </Button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Sliding window of five page buttons around the current page
              let pageNum
              if (totalPages <= 5 || page <= 3) pageNum = i + 1
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
              else pageNum = page - 2 + i

              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  aria-current={page === pageNum ? "page" : undefined}
                  onClick={() => onPageChange(pageNum)}
                  className={`h-9 w-9 p-0 ${page === pageNum ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {pageNum}
                </Button>
              )
            })}

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-9 w-9 p-0"
            >
              <span className="sr-only">Next page</span>
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { DataTable }
export type {
  DataTableColumn,
  DataTablePagination,
  DataTableProps,
  DataTableSelection,
  DataTableSort,
}
