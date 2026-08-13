'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Repeat, CalendarCheck, CalendarClock, HelpCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnhancedStatCard, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { usePaymentCadenceAnalytics } from '@/hooks/use-analytics-payment-behavior';
import type { PaymentCadence } from '@/lib/analytics/classify-payment-cadence';

const CategoryBreakdownChart = dynamic(
  () => import('@/components/analytics/category-breakdown-chart').then((m) => ({ default: m.CategoryBreakdownChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const CADENCE_BADGE_VARIANT: Record<PaymentCadence, 'success' | 'info' | 'warning' | 'outline'> = {
  monthly: 'success',
  annual: 'info',
  irregular: 'warning',
  insufficient_data: 'outline',
};

export function PaymentBehaviorTab() {
  const { data, isLoading } = usePaymentCadenceAnalytics();
  const [showAll, setShowAll] = useState(false);

  const monthlyCount = data?.distribution.find((d) => d.category === 'Monthly payers')?.count ?? 0;
  const annualCount = data?.distribution.find((d) => d.category === 'Annual payers')?.count ?? 0;
  const irregularCount = data?.distribution.find((d) => d.category === 'Irregular payers')?.count ?? 0;

  const drillDownRows = showAll ? data?.residents ?? [] : (data?.residents ?? []).slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <EnhancedStatCard
          title="Monthly Payers"
          value={monthlyCount || '-'}
          icon={CalendarCheck}
          isLoading={isLoading}
          accentColor="success"
        />
        <EnhancedStatCard
          title="Annual Payers"
          value={annualCount || '-'}
          icon={CalendarClock}
          isLoading={isLoading}
          accentColor="info"
        />
        <EnhancedStatCard
          title="Irregular Payers"
          value={irregularCount || '-'}
          icon={HelpCircle}
          isLoading={isLoading}
          accentColor="warning"
        />
      </div>

      <CategoryBreakdownChart
        data={data?.distribution ?? null}
        isLoading={isLoading}
        title="Payment Cadence Distribution"
        description="Residents grouped by typical interval between payments"
        showAmount={false}
      />

      <EnhancedTableCard
        title="Payment Cadence by Resident"
        description="Sorted by median gap between payments"
        actions={
          data && data.residents.length > 15 ? (
            <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${data.residents.length}`}
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.residents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No payment history available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 font-medium">Resident</th>
                  <th className="pb-2 font-medium text-right">Payments</th>
                  <th className="pb-2 font-medium text-right">Median Gap</th>
                  <th className="pb-2 font-medium text-right">Cadence</th>
                </tr>
              </thead>
              <tbody>
                {drillDownRows.map((r) => (
                  <tr key={r.residentId} className="border-b last:border-0">
                    <td className="py-2">
                      <Link href={`/residents/${r.residentId}`} className="font-medium hover:underline hover:text-primary">
                        {r.residentName}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.paymentCount}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {r.medianGapDays !== null ? `${r.medianGapDays}d` : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <Badge variant={CADENCE_BADGE_VARIANT[r.cadence]} className="text-xs">
                        <Repeat className="h-3 w-3 mr-1" />
                        {r.cadence.replace('_', ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </EnhancedTableCard>
    </div>
  );
}
