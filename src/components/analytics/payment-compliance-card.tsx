'use client';

import { CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
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
    <Card className="animate-fade-in-up">
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
          <AnimatedCounter
            value={data.percentage}
            suffix="%"
            className={cn(
              'text-4xl font-bold',
              data.percentage >= 80
                ? 'text-emerald-600'
                : data.percentage >= 50
                ? 'text-amber-600'
                : 'text-red-600'
            )}
            duration={1000}
          />
          <p className="text-xs text-muted-foreground mt-1">on-time rate</p>
        </div>

        {/* Stacked Bar with animation */}
        <div className="h-6 w-full rounded-full overflow-hidden flex bg-muted">
          {data.onTime > 0 && (
            <div
              className="bg-emerald-500 h-full transition-all duration-1000 ease-out"
              style={{ width: `${onTimePercentage}%` }}
            />
          )}
          {data.late > 0 && (
            <div
              className="bg-amber-500 h-full transition-all duration-1000 ease-out"
              style={{ width: `${latePercentage}%` }}
            />
          )}
        </div>

        {/* Legend with AnimatedCounter */}
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-muted-foreground">On-time</span>
            <AnimatedCounter
              value={data.onTime}
              className="font-medium"
              duration={600}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            <span className="text-muted-foreground">Late</span>
            <AnimatedCounter
              value={data.late}
              className="font-medium"
              duration={600}
            />
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
          <ShimmerSkeleton width={16} height={16} speed="fast" />
          <div className="space-y-1">
            <ShimmerSkeleton width={128} height={16} speed="fast" />
            <ShimmerSkeleton width={112} height={12} speed="fast" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <ShimmerSkeleton width={64} height={40} className="mx-auto" speed="normal" />
          <ShimmerSkeleton width={64} height={8} className="mx-auto" speed="fast" />
        </div>
        <ShimmerSkeleton height={24} className="w-full rounded-full" speed="normal" />
        <div className="flex justify-between">
          <ShimmerSkeleton width={80} height={16} speed="fast" />
          <ShimmerSkeleton width={64} height={16} speed="fast" />
        </div>
      </CardContent>
    </Card>
  );
}
