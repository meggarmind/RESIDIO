'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import type { HouseTypeAggregate } from '@/actions/analytics/get-house-street-breakdown';

interface HouseTypeChartProps {
  data: HouseTypeAggregate[] | null;
  isLoading?: boolean;
}

function HouseTypeTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: HouseTypeAggregate }> }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-card border rounded-lg p-2 shadow-lg text-sm">
        <p className="font-medium">{item.houseTypeName}</p>
        <p className="text-muted-foreground">{item.occupiedHouses} / {item.totalHouses} occupied</p>
        <p className="text-xs text-muted-foreground">{item.occupancyRate}% occupancy</p>
      </div>
    );
  }
  return null;
}

/**
 * House Type Chart
 *
 * Horizontal bar chart: occupancy rate per house type.
 */
export function HouseTypeChart({ data, isLoading }: HouseTypeChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Occupancy by House Type</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No house type data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-violet-600" />
          <div>
            <CardTitle className="text-base">Occupancy by House Type</CardTitle>
            <CardDescription className="text-xs">Occupancy rate (%)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
              <YAxis type="category" dataKey="houseTypeName" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" width={100} />
              <Tooltip content={<HouseTypeTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Bar dataKey="occupancyRate" radius={[0, 4, 4, 0]} maxBarSize={22} fill="hsl(280.5 84.1% 58%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ShimmerSkeleton width={16} height={16} speed="fast" />
          <div className="space-y-1">
            <ShimmerSkeleton width={160} height={16} speed="fast" />
            <ShimmerSkeleton width={100} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <ShimmerSkeleton width={90} height={16} speed="fast" />
              <ShimmerSkeleton height={20} className="flex-1" speed="normal" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
