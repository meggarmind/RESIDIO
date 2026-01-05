'use client';

import { Home, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
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

  const getColors = () => {
    if (data.percentage >= 80) {
      return {
        color: 'hsl(142.1 76.2% 36.3%)', // emerald-600
        gradientColor: 'hsl(142.1 70.6% 45.3%)', // emerald-500
      };
    }
    if (data.percentage >= 50) {
      return {
        color: 'hsl(24.6 95% 53.1%)', // orange-500
        gradientColor: 'hsl(37.7 92.1% 50.2%)', // amber-500
      };
    }
    return {
      color: 'hsl(0 84.2% 60.2%)', // red-500
      gradientColor: 'hsl(0 72.2% 50.6%)', // red-600
    };
  };

  const { color, gradientColor } = getColors();

  return (
    <Card className="animate-fade-in-up">
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
        {/* Progress Ring */}
        <div className="flex justify-center">
          <ProgressRing
            value={data.percentage}
            size={140}
            strokeWidth={12}
            duration={1200}
            color={color}
            gradientColor={gradientColor}
            showValue
          />
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-0.5">
            <AnimatedCounter
              value={data.occupied}
              className="text-lg font-semibold text-emerald-600"
              duration={800}
            />
            <p className="text-[10px] text-muted-foreground">Occupied</p>
          </div>
          <div className="space-y-0.5">
            <AnimatedCounter
              value={data.vacant}
              className="text-lg font-semibold text-amber-600"
              duration={800}
            />
            <p className="text-[10px] text-muted-foreground">Vacant</p>
          </div>
          <div className="space-y-0.5">
            <AnimatedCounter
              value={data.total}
              className="text-lg font-semibold"
              duration={800}
            />
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
          <ShimmerSkeleton width={16} height={16} speed="fast" />
          <div className="space-y-1">
            <ShimmerSkeleton width={112} height={16} speed="fast" />
            <ShimmerSkeleton width={128} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <ShimmerSkeleton width={140} height={140} rounded="full" speed="normal" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <ShimmerSkeleton width={32} height={24} className="mx-auto" speed="fast" />
              <ShimmerSkeleton width={48} height={8} className="mx-auto" speed="fast" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
