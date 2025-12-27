'use client';

import { CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PaymentComplianceData } from '@/types/analytics';

interface PaymentComplianceCardProps {
  data: PaymentComplianceData | null;
  isLoading?: boolean;
}

/**
 * Payment Compliance Card Component
 *
 * Shows on-time vs late payment statistics with a visual breakdown.
 */
export function PaymentComplianceCard({ data, isLoading }: PaymentComplianceCardProps) {
  if (isLoading) {
    return <CardSkeleton />;
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Payment Compliance</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[120px] flex items-center justify-center text-muted-foreground">
            No payment data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const onTimePercentage = data.total > 0 ? (data.onTime / data.total) * 100 : 0;
  const latePercentage = data.total > 0 ? (data.late / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-teal-600" />
          <div>
            <CardTitle className="text-base">Payment Compliance</CardTitle>
            <CardDescription className="text-xs">
              On-time vs late payments
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Compliance Rate */}
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
          <p className="text-xs text-muted-foreground mt-1">on-time rate</p>
        </div>

        {/* Stacked Bar */}
        <div className="h-6 w-full rounded-full overflow-hidden flex bg-muted">
          {data.onTime > 0 && (
            <div
              className="bg-emerald-500 h-full transition-all"
              style={{ width: `${onTimePercentage}%` }}
            />
          )}
          {data.late > 0 && (
            <div
              className="bg-amber-500 h-full transition-all"
              style={{ width: `${latePercentage}%` }}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">On-time</span>
            <span className="font-medium">{data.onTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Late</span>
            <span className="font-medium">{data.late}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
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
      <CardContent className="space-y-4">
        <div className="text-center">
          <Skeleton className="h-10 w-16 mx-auto" />
          <Skeleton className="h-2 w-16 mx-auto mt-2" />
        </div>
        <Skeleton className="h-6 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}
