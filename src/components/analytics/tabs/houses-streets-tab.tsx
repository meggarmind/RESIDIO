'use client';

import dynamic from 'next/dynamic';
import { Home, Building2, MapPin, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedStatCard, EnhancedTableCard } from '@/components/dashboard/enhanced-stat-card';
import { useHouseStreetAnalytics } from '@/hooks/use-analytics-houses';
import { formatCurrency } from '@/lib/utils';

const OccupancyGauge = dynamic(
  () => import('@/components/analytics/occupancy-gauge').then((m) => ({ default: m.OccupancyGauge })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const StreetOccupancyChart = dynamic(
  () => import('@/components/analytics/street-occupancy-chart').then((m) => ({ default: m.StreetOccupancyChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const HouseTypeChart = dynamic(
  () => import('@/components/analytics/house-type-chart').then((m) => ({ default: m.HouseTypeChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

export function HousesStreetsTab() {
  const { data, isLoading } = useHouseStreetAnalytics();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <EnhancedStatCard
          title="Total Houses"
          value={data?.overallOccupancy.total ?? '-'}
          icon={Home}
          isLoading={isLoading}
          accentColor="default"
        />
        <EnhancedStatCard
          title="Occupied"
          value={data?.overallOccupancy.occupied ?? '-'}
          icon={TrendingUp}
          isLoading={isLoading}
          accentColor="success"
        />
        <EnhancedStatCard
          title="Vacant"
          value={data?.overallOccupancy.vacant ?? '-'}
          icon={Building2}
          isLoading={isLoading}
          accentColor="warning"
        />
        <EnhancedStatCard
          title="Streets"
          value={data?.byStreet.length ?? '-'}
          icon={MapPin}
          isLoading={isLoading}
          accentColor="info"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <OccupancyGauge data={data?.overallOccupancy ?? null} isLoading={isLoading} />
        <div className="lg:col-span-2">
          <StreetOccupancyChart data={data?.byStreet ?? null} isLoading={isLoading} />
        </div>
      </div>

      <HouseTypeChart data={data?.byHouseType ?? null} isLoading={isLoading} />

      <EnhancedTableCard title="Outstanding by Street" description="Streets ranked by total outstanding balance">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.byStreet.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No street data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="pb-2 font-medium">Street</th>
                  <th className="pb-2 font-medium text-right">Houses</th>
                  <th className="pb-2 font-medium text-right">Occupancy</th>
                  <th className="pb-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.byStreet.map((street) => (
                  <tr key={street.streetId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{street.streetName}</td>
                    <td className="py-2 text-right tabular-nums">{street.totalHouses}</td>
                    <td className="py-2 text-right tabular-nums">{street.occupancyRate}%</td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-600 dark:text-red-400">
                      {street.totalOutstanding > 0 ? formatCurrency(street.totalOutstanding) : '—'}
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
