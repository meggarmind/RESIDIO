'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const AnalyticsPageClient = dynamic(
  () => import('./analytics-page-client').then((m) => ({ default: m.AnalyticsPageClient })),
  {
    loading: () => (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-1.5 h-9">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-24" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    ),
    ssr: false,
  }
);

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
