'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedStatCard } from '@/components/dashboard/enhanced-stat-card';
import { Pagination } from '@/components/ui/simple-pagination';
import { useCan } from '@/components/auth/can';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { cn, formatDayMedium, formatTime12 } from '@/lib/utils';
import {
  useManualFetch,
  useCancelImport,
  useRetryImport,
} from '@/hooks/use-gmail-connection';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Settings,
  X,
  XCircle,
} from 'lucide-react';
import { getEmailImportSummary, listEmailImports } from '@/actions/email-imports/create-email-import';
import type { EmailImport, EmailImportStatus } from '@/types/database';

type CardKey = 'all' | 'completed' | 'queued' | 'auto';

const PAGE_SIZE = 25;
const IN_PROGRESS: EmailImportStatus[] = ['fetching', 'parsing', 'matching', 'processing'];

const LIST_TITLES: Record<CardKey, string> = {
  all: 'All imports',
  completed: 'Completed imports',
  queued: 'Imports with queued transactions',
  auto: 'Imports with auto-processed transactions',
};

function filterParams(card: CardKey): { status?: EmailImportStatus; has?: 'queued' | 'auto_processed' } {
  if (card === 'completed') return { status: 'completed' };
  if (card === 'queued') return { has: 'queued' };
  if (card === 'auto') return { has: 'auto_processed' };
  return {};
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function StatusIcon({ status }: { status: EmailImportStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 role="img" aria-label="Completed" className="h-5 w-5 shrink-0 text-green-600" />;
  }
  if (status === 'failed') {
    return <XCircle role="img" aria-label="Failed" className="h-5 w-5 shrink-0 text-destructive" />;
  }
  if (status === 'pending') {
    return <Clock role="img" aria-label="Pending" className="h-5 w-5 shrink-0 text-muted-foreground" />;
  }
  return (
    <Loader2
      role="img"
      aria-label={`In progress: ${status}`}
      className="h-5 w-5 shrink-0 animate-spin text-blue-500"
    />
  );
}

export default function EmailImportsPage() {
  const router = useRouter();
  const [card, setCard] = useState<CardKey>('all');
  const [page, setPage] = useState(1);

  const cancelMutation = useCancelImport();
  const retryMutation = useRetryImport();
  const manualFetchMutation = useManualFetch();
  // The same permissions the actions enforce: cancel, retry and manual fetch are
  // email_imports.trigger; the Configure link leads to email_imports.configure.
  const canTrigger = useCan(PERMISSIONS.EMAIL_IMPORTS_TRIGGER);
  const canConfigure = useCan(PERMISSIONS.EMAIL_IMPORTS_CONFIGURE);
  // The queued transactions are worked on Awaiting verification, which needs email_imports.process (#1432).
  const canProcess = useCan(PERMISSIONS.EMAIL_IMPORTS_PROCESS);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['email-imports', 'summary'],
    queryFn: async () => {
      const result = await getEmailImportSummary();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['email-imports', card, page],
    queryFn: async () => {
      const result = await listEmailImports({
        ...filterParams(card),
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
  });

  const selectCard = (next: CardKey) => {
    setCard(next);
    setPage(1);
  };

  const rows = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  const todayLabel = formatDayMedium(new Date());
  const groups: { day: string; items: EmailImport[] }[] = [];
  for (const item of rows) {
    const day = formatDayMedium(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  const openImport = (id: string) => router.push(`/payments/email-imports/${id}`);

  const renderFlow = (item: EmailImport) => {
    if (item.status === 'failed') {
      return <span className="text-destructive">Import failed. Open to retry.</span>;
    }
    if (item.status !== 'completed') {
      return <span className="capitalize text-muted-foreground">{item.status}</span>;
    }
    const emails = item.emails_fetched || 0;
    const txns = item.transactions_extracted || 0;
    const auto = item.transactions_auto_processed || 0;
    const queued = item.transactions_queued || 0;
    return (
      <>
        <span>{plural(emails, 'email', 'emails')}</span>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
        <span>{plural(txns, 'txn', 'txns')}</span>
        {txns > 0 && (
          <>
            <span aria-hidden="true" className="text-muted-foreground">→</span>
            <span className="text-purple-600 dark:text-purple-400">{auto} auto</span>
            {queued > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {queued} queued
              </span>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email Imports</h1>
          <p className="text-muted-foreground mt-1">
            View history of email import sessions and review queued transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canTrigger && (
            <Button
              variant="outline"
              onClick={() => manualFetchMutation.mutate()}
              disabled={manualFetchMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${manualFetchMutation.isPending ? 'animate-spin' : ''}`} />
              {manualFetchMutation.isPending ? 'Fetching...' : 'Manual Fetch'}
            </Button>
          )}

          {canConfigure && (
            <Button variant="outline" asChild>
              <a href="/settings/email-integration">
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards: each one filters the list below */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <EnhancedStatCard
          title="Total Imports"
          value={summary?.total ?? 0}
          icon={Mail}
          accentColor="info"
          isLoading={summaryLoading}
          animate={false}
          selected={card === 'all'}
          onClick={() => selectCard('all')}
        />
        <EnhancedStatCard
          title="Completed"
          value={summary?.completed ?? 0}
          icon={CheckCircle2}
          accentColor="success"
          isLoading={summaryLoading}
          animate={false}
          selected={card === 'completed'}
          onClick={() => selectCard('completed')}
        />
        <EnhancedStatCard
          title="Queued for Review"
          value={summary?.queued ?? 0}
          icon={Inbox}
          accentColor="warning"
          isLoading={summaryLoading}
          animate={false}
          selected={card === 'queued'}
          onClick={() =>
            canProcess ? router.push('/payments/awaiting-verification') : selectCard('queued')
          }
        />
        <EnhancedStatCard
          title="Auto-Processed"
          value={summary?.autoProcessed ?? 0}
          icon={FileText}
          accentColor="default"
          isLoading={summaryLoading}
          animate={false}
          selected={card === 'auto'}
          onClick={() => selectCard('auto')}
        />
      </div>

      {/* Import list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{LIST_TITLES[card]}</CardTitle>
              <CardDescription>Select a card above to change the list</CardDescription>
            </div>
            {card !== 'all' && (
              <Button variant="link" onClick={() => selectCard('all')}>
                Show all imports
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Failed to load imports: {error.message}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {card === 'all'
                ? 'No email imports yet. Connect Gmail in settings to start.'
                : 'No imports match this filter.'}
            </div>
          ) : (
            <div>
              {groups.map((group) => (
                <div key={group.day}>
                  <div className="flex items-center justify-between border-b py-2 text-sm font-medium text-muted-foreground">
                    <span>
                      {group.day === todayLabel ? 'Today, ' : ''}
                      {group.day}
                    </span>
                    <span>{plural(group.items.length, 'import', 'imports')}</span>
                  </div>
                  {group.items.map((importItem: EmailImport) => (
                    <div
                      key={importItem.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open email import from ${formatDayMedium(importItem.created_at)}, ${formatTime12(importItem.created_at)}`}
                      onClick={() => openImport(importItem.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openImport(importItem.id);
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 border-b px-2 py-3',
                        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                      )}
                    >
                      <span className="w-20 shrink-0 text-sm font-medium tabular-nums">
                        {formatTime12(importItem.created_at)}
                      </span>
                      <span className="hidden w-20 shrink-0 sm:block">
                        <Badge variant="outline">
                          {importItem.trigger_type === 'cron' ? 'Cron' : 'Manual'}
                        </Badge>
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {renderFlow(importItem)}
                      </div>
                      <StatusIcon status={importItem.status} />
                      <div className="flex shrink-0 gap-1">
                        {canTrigger && IN_PROGRESS.includes(importItem.status) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Retry Processing"
                              aria-label="Retry Processing"
                              onClick={(e) => { e.stopPropagation(); retryMutation.mutate(importItem.id); }}
                              disabled={retryMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4 text-orange-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cancel Import"
                              aria-label="Cancel Import"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); cancelMutation.mutate(importItem.id); }}
                              disabled={cancelMutation.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {canTrigger && importItem.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Retry Processing"
                            aria-label="Retry Processing"
                            onClick={(e) => { e.stopPropagation(); retryMutation.mutate(importItem.id); }}
                            disabled={retryMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {firstShown} to {lastShown} of {total}
                </p>
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
