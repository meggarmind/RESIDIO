'use client';

import { TrendingUp, TrendingDown, DollarSign, Percent, Home, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import type { KPIData } from '@/types/analytics';

interface KPISummaryCardsProps {
  kpis: KPIData | null;
  isLoading?: boolean;
}

/**
 * KPI Summary Cards Component
 *
 * Displays key performance indicators in a responsive grid.
 * Shows revenue, net income, collection rate, and occupancy rate.
 */
export function KPISummaryCards({ kpis, isLoading }: KPISummaryCardsProps) {
  if (isLoading || !kpis) {
    return <KPISkeleton />;
  }

  const cards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(kpis.totalRevenue),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
      description: 'Collected in period',
    },
    {
      title: 'Net Income',
      value: formatCurrency(kpis.netIncome),
      icon: kpis.netIncome >= 0 ? TrendingUp : TrendingDown,
      color: kpis.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600',
      bgColor: kpis.netIncome >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
      description: 'Revenue minus expenses',
    },
    {
      title: 'Collection Rate',
      value: `${kpis.collectionRate}%`,
      icon: Target,
      color: kpis.collectionRate >= 80 ? 'text-emerald-600' : kpis.collectionRate >= 50 ? 'text-amber-600' : 'text-red-600',
      bgColor: kpis.collectionRate >= 80 ? 'bg-emerald-500/10' : kpis.collectionRate >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10',
      description: 'Paid vs billed',
    },
    {
      title: 'Occupancy Rate',
      value: `${kpis.occupancyRate}%`,
      icon: Home,
      color: kpis.occupancyRate >= 80 ? 'text-emerald-600' : kpis.occupancyRate >= 50 ? 'text-amber-600' : 'text-red-600',
      bgColor: kpis.occupancyRate >= 80 ? 'bg-emerald-500/10' : kpis.occupancyRate >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10',
      description: 'Occupied properties',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className={cn('text-xl font-bold', card.color)}>
                  {card.value}
                </p>
                <p className="text-[10px] text-muted-foreground/80">
                  {card.description}
                </p>
              </div>
              <div className={cn('p-2 rounded-lg', card.bgColor)}>
                <card.icon className={cn('h-4 w-4', card.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-2 w-16" />
              </div>
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
