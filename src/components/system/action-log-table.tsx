'use client';

import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SystemActionLogRow, SystemActionOutcome } from '@/actions/system/action-log';

const OUTCOME_STYLES: Record<SystemActionOutcome, string> = {
  success: 'bg-green-100 text-green-800 border-green-200',
  partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  failure: 'bg-red-100 text-red-800 border-red-200',
};

interface ActionLogTableProps {
  rows: SystemActionLogRow[] | null;
  total: number;
  page: number;
  limit: number;
  isLoading?: boolean;
  error?: string | null;
  hasFilters?: boolean;
  onPageChange: (page: number) => void;
  onClearFilters?: () => void;
}

export function ActionLogTable({
  rows,
  total,
  page,
  limit,
  isLoading,
  error,
  hasFilters,
  onPageChange,
  onClearFilters,
}: ActionLogTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="py-12 text-center text-sm text-destructive">
        Could not load the action log: {error}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <ScrollText className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">No actions recorded</p>
        <p className="text-sm text-muted-foreground">
          {hasFilters
            ? 'No entries match the current filters.'
            : 'Automated runs such as cron jobs and webhooks appear here once they have run.'}
        </p>
        {hasFilters && onClearFilters && (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-sm">
                {format(new Date(row.occurred_at), 'MMM d, yyyy h:mm:ss a')}
              </TableCell>
              <TableCell className="font-mono text-xs">{row.source}</TableCell>
              <TableCell className="text-sm">{row.action}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn('capitalize', OUTCOME_STYLES[row.outcome])}>
                  {row.outcome}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {row.duration_ms === null ? '-' : `${row.duration_ms} ms`}
              </TableCell>
              <TableCell className="max-w-md space-y-1">
                {row.error_message && (
                  <p className="text-xs text-destructive break-words">{row.error_message}</p>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Summary
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(row.summary ?? {}, null, 2)}
                  </pre>
                </details>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages} ({total} entries)
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
