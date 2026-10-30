'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Auto-refresh choices in minutes. 0 turns auto-refresh off.
export const REFRESH_INTERVAL_MINUTES = [0, 1, 2, 5, 10, 15, 30] as const;

function formatTime(value: Date) { return new Intl.DateTimeFormat('en-NG', { timeStyle: 'medium' }).format(value); }

/** Refreshes every panel on the page: the server-rendered logs and the sent messages query. */
export function MonitorRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
    void queryClient.invalidateQueries({ queryKey: ['whatsapp-outbound-sends'] });
    setRefreshedAt(new Date());
  }, [router, queryClient]);

  useEffect(() => {
    if (minutes === 0) return;
    const timer = setInterval(refresh, minutes * 60_000);
    return () => clearInterval(timer);
  }, [minutes, refresh]);

  return <div className="flex flex-wrap items-center gap-2">
    {refreshedAt ? <span className="text-xs text-muted-foreground">Refreshed {formatTime(refreshedAt)}</span> : null}
    <select aria-label="Auto-refresh" className="h-9 rounded-md border bg-background px-2 text-sm" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
      {REFRESH_INTERVAL_MINUTES.map((value) => <option key={value} value={value}>{value === 0 ? 'Auto-refresh off' : `Every ${value} min`}</option>)}
    </select>
    <Button variant="outline" size="sm" disabled={isPending} onClick={refresh}><RefreshCw className={isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />Refresh now</Button>
  </div>;
}
