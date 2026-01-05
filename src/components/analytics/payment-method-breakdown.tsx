'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import type { CategoryData } from '@/types/analytics';

interface PaymentMethodBreakdownProps {
  data: CategoryData[] | null;
  isLoading?: boolean;
}

// Chart colors
const COLORS = [
  'hsl(142.1 76.2% 36.3%)', // emerald
  'hsl(217.2 91.2% 59.8%)', // blue
  'hsl(47.9 95.8% 53.1%)',  // amber
  'hsl(280.5 84.1% 58%)',   // violet
  'hsl(var(--muted-foreground))', // gray
];

/**
 * Payment Method Breakdown Component
 *
 * Pie chart showing distribution of payment methods.
 */
export function PaymentMethodBreakdown({ data, isLoading }: PaymentMethodBreakdownProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No payment method data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format currency for tooltip
  const formatTooltipValue = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg p-2 shadow-lg text-sm">
          <p className="font-medium">{data.category}</p>
          <p className="text-muted-foreground">
            {formatTooltipValue(data.amount)} ({data.percentage}%)
          </p>
          <p className="text-xs text-muted-foreground">
            {data.count} transactions
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom legend
  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-1.5 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-600" />
          <div>
            <CardTitle className="text-base">Payment Methods</CardTitle>
            <CardDescription className="text-xs">
              Distribution by method type
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="amount"
                nameKey="category"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
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
            <ShimmerSkeleton width={112} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] flex items-center justify-center">
          <ShimmerSkeleton width={144} height={144} rounded="full" speed="normal" />
        </div>
      </CardContent>
    </Card>
  );
}
