'use client';

import Link from 'next/link';
import { FileText, ChevronRight, CheckCircle2 } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ModernPendingPaymentsProps {
  distribution: InvoiceStatusDistribution | null;
  isLoading?: boolean;
}

function StatusSegment({ count, total, color, label }: { count: number; total: number; color: string; label: string }) {
  if (count === 0) return null;
  const percentage = (count / total) * 100;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn("h-full first:rounded-l-full last:rounded-r-full transition-all hover:opacity-80 active:scale-y-110", color)}
            style={{ width: `${percentage}%` }}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", color)} />
          <span className="font-semibold">{count}</span> {label} ({Math.round(percentage)}%)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LegendItem({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5">
      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />
      <span className="text-[10px] font-medium text-muted-foreground truncate">{label}</span>
      <span className="text-[10px] font-bold text-foreground ml-auto">{count}</span>
    </div>
  );
}

function PendingPaymentsSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 h-[205px]">
      <div className="mb-4 flex items-center justify-between">
        <ShimmerSkeleton width={100} height={16} speed="fast" />
        <ShimmerSkeleton width={40} height={12} speed="fast" />
      </div>
      <ShimmerSkeleton width="100%" height={20} rounded="full" speed="fast" className="mb-4" />
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <ShimmerSkeleton key={i} width="70%" height={10} speed="fast" />
        ))}
      </div>
    </div>
  );
}

export function ModernPendingPayments({ distribution, isLoading }: ModernPendingPaymentsProps) {
  if (isLoading || !distribution) {
    return <PendingPaymentsSkeleton />;
  }

  const { overdue, unpaid, partiallyPaid, void: voidCount, paid } = distribution;
  const total = overdue + unpaid + partiallyPaid + voidCount + paid;
  const hasInvoices = total > 0;

  if (!hasInvoices) {
    return (
      <div className="rounded-xl border bg-card p-4 h-[205px] flex flex-col items-center justify-center text-center">
        <CheckCircle2 className="h-10 w-10 text-status-success mb-2 opacity-20" />
        <h4 className="text-[11px] font-semibold mb-0.5">Quiet Flow</h4>
        <p className="text-[10px] text-muted-foreground">Invoices will show trends here.</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 shadow-soft transition-all duration-300 h-[205px]',
      'hover:shadow-elevated'
    )}>
      {/* Header */}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-bold tracking-tight uppercase">Payments Traffic</h3>
        </div>
        <Link
          href="/billing"
          className="flex items-center gap-0.5 text-[10px] font-bold text-primary hover:opacity-80 transition-opacity"
        >
          Details
          <ChevronRight className="h-2.5 w-2.5" />
        </Link>
      </div>

      {/* Distribution Bar */}
      <div className="relative mb-4 pt-1">
        <div className="w-full h-5 bg-muted/30 rounded-full flex overflow-hidden p-0.5 border border-muted-foreground/10">
          <StatusSegment count={overdue} total={total} color="bg-status-error" label="Overdue" />
          <StatusSegment count={unpaid} total={total} color="bg-status-warning" label="Unpaid" />
          <StatusSegment count={partiallyPaid} total={total} color="bg-accent-primary" label="Partial" />
          <StatusSegment count={paid} total={total} color="bg-status-success" label="Paid" />
          <StatusSegment count={voidCount} total={total} color="bg-muted-foreground/30" label="Void" />
        </div>
      </div>

      {/* Legend Grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-muted/50 pt-3">
        <LegendItem label="Overdue" count={overdue} color="bg-status-error" />
        <LegendItem label="Unpaid" count={unpaid} color="bg-status-warning" />
        <LegendItem label="Partial" count={partiallyPaid} color="bg-accent-primary" />
        <LegendItem label="Paid" count={paid} color="bg-status-success" />
        <LegendItem label="Void" count={voidCount} color="bg-muted-foreground/30" />
      </div>

      {/* Visual Indicator of urgency if needed */}
      {overdue > 0 && (
        <div className="absolute top-2 right-2 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-error opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-error"></span>
        </div>
      )}
    </div>
  );
}
