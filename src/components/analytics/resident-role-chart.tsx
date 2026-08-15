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
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import type { ResidentRoleBreakdown } from '@/actions/analytics/get-resident-breakdown';

interface ResidentRoleChartProps {
  data: ResidentRoleBreakdown[] | null;
  isLoading?: boolean;
}

const PRIMARY_COLOR = 'hsl(217.2 91.2% 59.8%)'; // blue — billable/primary roles
const SECONDARY_COLOR = 'hsl(37.7 92.1% 50.2%)'; // amber — non-billable/secondary roles

function RoleTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ResidentRoleBreakdown }> }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-card border rounded-lg p-2 shadow-lg text-sm">
        <p className="font-medium">{item.label}</p>
        <p className="text-muted-foreground">{item.count} assignment{item.count === 1 ? '' : 's'}</p>
        <p className="text-xs text-muted-foreground">{item.isPrimary ? 'Primary / billable' : 'Secondary / non-billable'}</p>
      </div>
    );
  }
  return null;
}

/**
 * Resident Role Chart
 *
 * Horizontal bar chart showing active resident_houses assignments by role,
 * color-coded by primary (billable) vs secondary (non-billable) role.
 */
export function ResidentRoleChart({ data, isLoading }: ResidentRoleChartProps) {
  if (isLoading) {
    return <ChartSkeleton />;
  }

  if (!data || data.every((d) => d.count === 0)) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Residents by Role</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No resident-role data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort primary roles first, then secondary, each descending by count
  const displayData = [...data].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return b.count - a.count;
  });

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <div>
            <CardTitle className="text-base">Residents by Role</CardTitle>
            <CardDescription className="text-xs">Active house assignments, blue = primary/billable, amber = secondary</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
              <YAxis type="category" dataKey="label" interval={0} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" width={110} />
              <Tooltip content={<RoleTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {displayData.map((entry) => (
                  <Cell key={entry.role} fill={entry.isPrimary ? PRIMARY_COLOR : SECONDARY_COLOR} />
                ))}
              </Bar>
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
              <ShimmerSkeleton width={90} height={16} speed="fast" />
              <ShimmerSkeleton height={20} className="flex-1" speed="normal" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
