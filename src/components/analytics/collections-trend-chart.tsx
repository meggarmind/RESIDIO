'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import type { CollectionsTrendPoint } from '@/actions/analytics/get-collections-trend';

interface CollectionsTrendChartProps {
  data: CollectionsTrendPoint[] | null;
  isLoading?: boolean;
}

/**
 * Collections Trend Chart
 *
 * Grouped bar chart: dues expected (due that month) vs amounts collected, per month.
 */
export function CollectionsTrendChart({ data, isLoading }: CollectionsTrendChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Dues Expected vs Collected</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No collections data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrencyAxis = (value: number) => {
    if (value >= 1000000) return `₦${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `₦${(value / 1000).toFixed(0)}K`;
    return `₦${value}`;
  };
  const formatTooltipValue = (value: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-blue-600" />
          <div>
            <CardTitle className="text-base">Dues Expected vs Collected</CardTitle>
            <CardDescription className="text-xs">Monthly invoice dues vs payments received</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
              <YAxis tickFormatter={formatCurrencyAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
              <Tooltip
                formatter={(value: number) => formatTooltipValue(value)}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="expected" name="Expected" fill="hsl(37.7 92.1% 50.2%)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="collected" name="Collected" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} maxBarSize={28} />
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
            <ShimmerSkeleton width={180} height={16} speed="fast" />
            <ShimmerSkeleton width={220} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ShimmerSkeleton height={250} className="w-full" speed="normal" />
      </CardContent>
    </Card>
  );
}
