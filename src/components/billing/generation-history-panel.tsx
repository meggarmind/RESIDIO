'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGenerationHistory } from '@/hooks/use-billing';
import { Download, History, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GenerationHistoryPanelProps {
  onRetry?: (period: string) => void;
}

export function GenerationHistoryPanel({ onRetry }: GenerationHistoryPanelProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGenerationHistory(page, 10);
  const entries = data?.data || [];
  const total = data?.total || 0;

  const downloadResults = (entry: { id: string; target_period: string | null; skip_reasons: Array<{ house: string; reason: string }> | null; errors: string[] | null; generated_count: number; skipped_count: number; error_count: number }) => {
    const csv = [
      'Metric,Value',
      `Run ID,${entry.id}`,
      `Period,${entry.target_period || 'N/A'}`,
      `Generated,${entry.generated_count}`,
      `Skipped,${entry.skipped_count}`,
      `Errors,${entry.error_count}`,
      '',
      'Skip Reasons',
      ...(entry.skip_reasons || []).map((s) => `"${s.house}","${s.reason}"`),
      '',
      'Errors',
      ...(entry.errors || []).map((e) => `"${e}"`),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation-${entry.target_period || entry.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No generation runs yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id} variant="compact">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.target_period || 'Unknown period'}</span>
                  <Badge variant={entry.trigger_type === 'cron' ? 'secondary' : 'outline'} className="text-[10px] uppercase">
                    {entry.trigger_type}
                  </Badge>
                  {entry.error_count > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {entry.error_count} errors
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(entry.generated_at), { addSuffix: true })}
                  <span className="mx-1">&bull;</span>
                  {entry.generated_count} generated, {entry.skipped_count} skipped
                  {entry.actor?.full_name && <><span className="mx-1">&bull;</span>{entry.actor.full_name}</>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => downloadResults(entry)}>
                  <Download className="h-3 w-3" />
                  CSV
                </Button>
                {entry.error_count > 0 && onRetry && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRetry(entry.target_period || '')}>
                    Retry
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {total > 10 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {Math.ceil(total / 10)}</span>
          <Button variant="outline" size="sm" disabled={page * 10 >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
