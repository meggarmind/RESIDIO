'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CategoryData } from '@/types/analytics';

interface CategoryBreakdownChartProps {
  data: CategoryData[] | null;
  isLoading?: boolean;
}

// Chart colors (gradient of blues/teals)
const COLORS = [
  'hsl(217.2 91.2% 59.8%)', // blue
  'hsl(199.4 89.7% 48.4%)', // sky
  'hsl(172.5 66% 50.4%)',   // teal
  'hsl(142.1 70.6% 45.3%)', // green
  'hsl(280.5 84.1% 58%)',   // violet
  'hsl(var(--muted-foreground))', // gray for others
];

/**
 * Category Breakdown Chart Component
 *
 * Horizontal bar chart showing invoice amounts by billing profile/category.
 */
export function CategoryBreakdownChart({ data, isLoading }: CategoryBreakdownChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Invoice Categories</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No category data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format currency for display
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `₦${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `₦${(value / 1000).toFixed(0)}K`;
    }
    return `₦${value}`;
  };

  const formatTooltipValue = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg p-2 shadow-lg text-sm">
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground">
            {formatTooltipValue(item.amount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.count} invoices ({item.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  // Take top 5 categories to prevent chart overflow
  const displayData = data.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-600" />
          <div>
            <CardTitle className="text-base">Invoice Categories</CardTitle>
            <CardDescription className="text-xs">
              Amount by billing profile
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-muted"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={formatCurrency}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                width={100}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Bar
                dataKey="amount"
                radius={[0, 4, 4, 0]}
                maxBarSize={30}
              >
                {displayData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Show remaining categories count if more than 5 */}
        {data.length > 5 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            +{data.length - 5} more categories
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 flex-1 rounded" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
