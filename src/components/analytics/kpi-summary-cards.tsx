'use client';

import { TrendingUp, TrendingDown, DollarSign, Percent, Home, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
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
      {cards.map((card, index) => (
        <Card key={card.title} variant="stat" className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
          <CardContent>
            <div className="flex items-start justify-between group">
              <div className="space-y-1 flex-1">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                {card.title.includes('Rate') ? (
                  <AnimatedCounter
                    value={parseFloat(card.value.replace('%', ''))}
                    suffix="%"
                    className={cn('text-xl font-bold', card.color)}
                    duration={800}
                  />
                ) : (
                  <AnimatedCounter
                    value={parseFloat(card.value.replace(/[₦,]/g, ''))}
                    prefix="₦"
                    formatNumber
                    className={cn('text-xl font-bold', card.color)}
                    duration={800}
                  />
                )}
                <p className="text-[10px] text-muted-foreground/80">
                  {card.description}
                </p>
              </div>
              <div className={cn(
                'p-2 rounded-lg transition-transform duration-200 group-hover:scale-110',
                card.bgColor
              )}>
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
        <Card key={i} variant="stat">
          <CardContent>
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <ShimmerSkeleton width={80} height={12} speed="fast" />
                <ShimmerSkeleton width={96} height={24} speed="normal" />
                <ShimmerSkeleton width={64} height={8} speed="fast" />
              </div>
              <ShimmerSkeleton width={32} height={32} rounded="lg" speed="fast" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
