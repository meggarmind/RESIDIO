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
import { MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import type { StreetAggregate } from '@/actions/analytics/get-house-street-breakdown';

interface StreetOccupancyChartProps {
  data: StreetAggregate[] | null;
  isLoading?: boolean;
}

/**
 * Street Occupancy Chart
 *
 * Grouped horizontal bar chart: occupied vs vacant houses per street.
 */
export function StreetOccupancyChart({ data, isLoading }: StreetOccupancyChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Occupancy by Street</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No street data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort by total houses descending, cap to keep the chart readable
  const displayData = [...data].sort((a, b) => b.totalHouses - a.totalHouses).slice(0, 10);

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          <div>
            <CardTitle className="text-base">Occupancy by Street</CardTitle>
            <CardDescription className="text-xs">Occupied vs vacant houses{data.length > 10 ? ` (top 10 of ${data.length})` : ''}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
              <YAxis type="category" dataKey="streetName" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" width={80} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="occupiedHouses" name="Occupied" stackId="a" fill="hsl(142.1 70.6% 45.3%)" radius={[0, 0, 0, 0]} maxBarSize={18} />
              <Bar dataKey="vacantHouses" name="Vacant" stackId="a" fill="hsl(37.7 92.1% 50.2%)" radius={[0, 4, 4, 0]} maxBarSize={18} />
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
            <ShimmerSkeleton width={128} height={16} speed="fast" />
            <ShimmerSkeleton width={160} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <ShimmerSkeleton width={70} height={16} speed="fast" />
              <ShimmerSkeleton height={20} className="flex-1" speed="normal" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
