'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PriorityDistribution } from '@/actions/announcements/analytics';

interface PriorityDistributionChartProps {
  data: PriorityDistribution[] | null;
  isLoading?: boolean;
}

// Priority-based colors
const PRIORITY_COLORS: Record<string, string> = {
  emergency: 'hsl(0 84.2% 60.2%)', // red
  high: 'hsl(24.6 95% 53.1%)', // orange
  normal: 'hsl(221.2 83.2% 53.3%)', // blue
  low: 'hsl(215.4 16.3% 46.9%)', // gray
};

/**
 * Priority Distribution Chart
 *
 * Pie chart showing distribution of announcements by priority level.
 * Color-coded by severity (emergency=red, high=orange, normal=blue, low=gray).
 */
export function PriorityDistributionChart({ data, isLoading }: PriorityDistributionChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Priority Distribution</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No priority data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart
  const chartData = data.map((item) => ({
    name: item.priority.charAt(0).toUpperCase() + item.priority.slice(1),
    value: item.count,
    percentage: item.percentage,
    color: PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg p-2 shadow-lg text-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">
            {data.value} announcements ({data.percentage}%)
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <div>
            <CardTitle className="text-base">Priority Distribution</CardTitle>
            <CardDescription className="text-xs">
              Announcements by priority level
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
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
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] flex items-center justify-center">
          <Skeleton className="w-36 h-36 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
