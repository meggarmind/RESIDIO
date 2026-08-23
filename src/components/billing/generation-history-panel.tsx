'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import {
  useCancelInvoiceGenerationRun,
  useGenerationHistory,
  useRetryInvoiceGenerationRun,
} from '@/hooks/use-billing';
import type { GenerationHistoryEntry } from '@/lib/billing/invoice-generation-history';
import { Download, History, Clock, AlertCircle, Ban, RotateCcw, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

export function buildGenerationResultsCsv(entry: GenerationHistoryEntry): string {
  return [
    'Metric,Value',
    `Run ID,${entry.id}`,
    `Period,${entry.target_period || 'N/A'}`,
    `Generated,${entry.generated_count}`,
    `Skipped,${entry.skipped_count}`,
    `Errors,${entry.error_count}`,
    `Email queued,${entry.email_queued ?? 0}`,
    `Email sent,${entry.email_sent ?? 0}`,
    `Email failed,${entry.email_failed ?? 0}`,
    '',
    'Skip Reasons',
    ...(entry.skip_reasons || []).map((s) => `"${s.house}","${s.reason}"`),
    '',
    'Errors',
    ...(entry.errors || []).map((e) => `"${e}"`),
  ].join('\n');
}

function downloadGenerationResultsCsv(entry: GenerationHistoryEntry) {
  const blob = new Blob([buildGenerationResultsCsv(entry)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `generation-${entry.target_period || entry.id.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function runStatusBadgeVariant(runStatus?: string) {
  if (runStatus === 'completed') return 'default' as const;
  if (runStatus === 'completed_with_errors') return 'destructive' as const;
  return 'secondary' as const;
}

interface GenerationHistoryPanelProps {
  onRetry?: (period: string) => void;
}

export function GenerationHistoryPanel({ onRetry }: GenerationHistoryPanelProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGenerationHistory(page, PAGE_SIZE);
  const cancelRun = useCancelInvoiceGenerationRun();
  const retryRun = useRetryInvoiceGenerationRun();
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';
  const entries = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <EnhancedTableCard
      title="Generation History"
      description="Recent invoice generation runs"
      className="animate-slide-up"
    >
      {isLoading ? (
        <div className="space-y-2 py-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <History className="mx-auto mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">No generation runs yet</p>
        </div>
      ) : (
        <>
          <div className={cn(
            'rounded-xl border overflow-hidden shadow-soft',
            isModern && 'border-gray-200 dark:border-[#334155]'
          )}>
            <Table variant={isModern ? 'modern' : 'default'}>
              <TableHeader>
                <TableRow interactive={false}>
                  <TableHead>Period</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Generated</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {entry.target_period || 'Unknown period'}
                      </div>
                      {(entry.actor?.full_name || (entry.email_sent ?? 0) > 0) && (
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {entry.actor?.full_name && <span>{entry.actor.full_name}</span>}
                          {(entry.email_sent ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {entry.email_sent} emailed
                            </span>
                          )}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.trigger_type === 'cron' ? 'secondary' : 'outline'} className="text-[10px] uppercase">
                        {entry.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.run_status && (
                          <Badge variant={runStatusBadgeVariant(entry.run_status)} className="text-[10px] uppercase">
                            {entry.run_status.replaceAll('_', ' ')}
                          </Badge>
                        )}
                        {entry.error_count > 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="mr-1 h-3 w-3" />
                            {entry.error_count} errors
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.generated_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.skipped_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{entry.error_count}</TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.generated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => downloadGenerationResultsCsv(entry)}>
                          <Download className="h-3 w-3" />
                          CSV
                        </Button>
                        {entry.source === 'run' && (entry.run_status === 'queued' || entry.run_status === 'processing') && (
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => cancelRun.mutate(entry.id)} disabled={cancelRun.isPending}>
                            <Ban className="h-3 w-3" />Cancel
                          </Button>
                        )}
                        {entry.source === 'run' && entry.run_status === 'completed_with_errors' && entry.error_count > 0 && (
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => retryRun.mutate({ runId: entry.id })} disabled={retryRun.isPending}>
                            <RotateCcw className="h-3 w-3" />Retry failed
                          </Button>
                        )}
                        {entry.error_count > 0 && onRetry && entry.source === 'legacy' && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRetry(entry.target_period || '')}>Retry</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className={cn('text-xs text-muted-foreground', isModern && 'text-gray-500 dark:text-gray-400')}>
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </EnhancedTableCard>
  );
}
