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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import type { CategoryEngagement } from '@/actions/announcements/analytics';

interface CategoryEngagementChartProps {
  data: CategoryEngagement[] | null;
  isLoading?: boolean;
}

/**
 * Category Engagement Chart
 *
 * Horizontal bar chart showing engagement rate by announcement category.
 * Sorted by engagement rate descending.
 */
export function CategoryEngagementChart({ data, isLoading }: CategoryEngagementChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Category Engagement</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No category data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for horizontal bar chart
  const chartData = data.map((item) => ({
    category: item.category_name,
    engagement: item.engagement_rate,
    reads: item.total_reads,
    published: item.total_published,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-600" />
          <div>
            <CardTitle className="text-base">Category Engagement</CardTitle>
            <CardDescription className="text-xs">
              Read rate by announcement category
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-muted"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                tickFormatter={(value) => `${value}%`}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                width={75}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'engagement') return [`${value}%`, 'Engagement'];
                  return [value, name];
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar
                dataKey="engagement"
                fill="hsl(142.1 76.2% 36.3%)"
                radius={[0, 4, 4, 0]}
                maxBarSize={30}
              />
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
          <Skeleton className="h-4 w-4" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[250px] w-full" />
      </CardContent>
    </Card>
  );
}
