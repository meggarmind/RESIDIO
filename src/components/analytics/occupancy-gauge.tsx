'use client';

import { Home, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { OccupancyData } from '@/types/analytics';

interface OccupancyGaugeProps {
  data: OccupancyData | null;
  isLoading?: boolean;
}

/**
 * Occupancy Gauge Component
 *
 * Shows current occupancy rate with a progress bar and stats.
 */
export function OccupancyGauge({ data, isLoading }: OccupancyGaugeProps) {
  if (isLoading) {
    return <GaugeSkeleton />;
  }

  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Occupancy</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[120px] flex items-center justify-center text-muted-foreground">
            No occupancy data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-500';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-violet-600" />
          <div>
            <CardTitle className="text-base">Occupancy Rate</CardTitle>
            <CardDescription className="text-xs">
              Current property occupancy
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Large Percentage Display */}
        <div className="text-center">
          <span
            className={cn(
              'text-4xl font-bold',
              data.percentage >= 80
                ? 'text-emerald-600'
                : data.percentage >= 50
                ? 'text-amber-600'
                : 'text-red-600'
            )}
          >
            {data.percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress
            value={data.percentage}
            className="h-3"
            // Note: Progress component styling is via Tailwind
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-0.5">
            <p className="text-lg font-semibold text-emerald-600">{data.occupied}</p>
            <p className="text-[10px] text-muted-foreground">Occupied</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-lg font-semibold text-amber-600">{data.vacant}</p>
            <p className="text-[10px] text-muted-foreground">Vacant</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-lg font-semibold">{data.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GaugeSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <Skeleton className="h-10 w-20 mx-auto" />
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-6 w-8 mx-auto" />
              <Skeleton className="h-2 w-12 mx-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
