'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { formatCurrency, cn } from '@/lib/utils';
import type { IndebtedResident } from '@/actions/analytics/get-indebtedness-rankings';

interface IndebtednessRankingTableProps {
  title: string;
  description?: string;
  data: IndebtedResident[] | null;
  isLoading?: boolean;
  variant: 'top' | 'bottom';
}

/**
 * Indebtedness Ranking Table
 *
 * Reusable ranked list for Top 10 Indebted / Top 10 Non-Indebted residents.
 */
export function IndebtednessRankingTable({ title, description, data, isLoading, variant }: IndebtednessRankingTableProps) {
  return (
    <EnhancedTableCard title={title} description={description}>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No data available</p>
      ) : (
        <ol className="divide-y">
          {data.map((resident, index) => (
            <li key={resident.residentId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums flex-shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <Link href={`/residents/${resident.residentId}`} className="font-medium text-sm hover:underline hover:text-primary truncate block">
                    {resident.residentName}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">
                    {resident.residentCode}{resident.houseNumber ? ` · ${resident.houseNumber}` : ''}{resident.streetName ? ` ${resident.streetName}` : ''}
                  </p>
                </div>
              </div>
              <span className={cn(
                'text-sm font-semibold tabular-nums flex-shrink-0',
                variant === 'top' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
              )}>
                {formatCurrency(Math.abs(resident.outstanding))}
                {variant === 'bottom' && resident.outstanding < 0 && <span className="text-xs font-normal text-muted-foreground ml-1">credit</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </EnhancedTableCard>
  );
}
