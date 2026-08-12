'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const FinancialDashboard = dynamic(
  () => import('./financial-dashboard').then((m) => ({ default: m.FinancialDashboard })),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><Skeleton className="h-80 rounded-xl" /></div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default function AnalyticsPage() {
  return <FinancialDashboard />;
}
