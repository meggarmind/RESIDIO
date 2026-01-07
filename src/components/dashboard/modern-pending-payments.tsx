'use client';

import Link from 'next/link';
import { FileText, Clock, AlertCircle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

interface ModernPendingPaymentsProps {
  distribution: InvoiceStatusDistribution | null;
  isLoading?: boolean;
}

interface PaymentItemProps {
  title: string;
  count: number;
  variant: 'overdue' | 'due-soon' | 'pending' | 'paid';
  icon: React.ElementType;
}

function PaymentItem({ title, count, variant, icon: Icon }: PaymentItemProps) {
  const variantStyles = {
    overdue: {
      bg: 'bg-red-50 dark:bg-red-900/10',
      border: 'border-red-200 dark:border-red-900/30',
      icon: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-100 dark:bg-red-900/20',
      text: 'text-red-900 dark:text-red-100',
      label: 'text-red-700 dark:text-red-300',
    },
    'due-soon': {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      border: 'border-amber-200 dark:border-amber-900/30',
      icon: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-100 dark:bg-amber-900/20',
      text: 'text-amber-900 dark:text-amber-100',
      label: 'text-amber-700 dark:text-amber-300',
    },
    pending: {
      bg: 'bg-gray-50 dark:bg-[#0F172A]',
      border: 'border-gray-200 dark:border-[#334155]',
      icon: 'text-gray-600 dark:text-gray-400',
      iconBg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-900 dark:text-white',
      label: 'text-gray-600 dark:text-gray-400',
    },
    paid: {
      bg: 'bg-green-50 dark:bg-green-900/10',
      border: 'border-green-200 dark:border-green-900/30',
      icon: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-900/20',
      text: 'text-green-900 dark:text-green-100',
      label: 'text-green-700 dark:text-green-300',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-all duration-200 hover:shadow-sm',
      styles.bg,
      styles.border
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          styles.iconBg
        )}>
          <Icon className={cn('h-5 w-5', styles.icon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', styles.label)}>{title}</p>
          <p className={cn('text-2xl font-bold', styles.text)}>{count}</p>
        </div>
      </div>
    </div>
  );
}

function PendingPaymentsSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155]">
      <div className="mb-6 flex items-center justify-between">
        <ShimmerSkeleton width={144} height={24} speed="fast" />
        <ShimmerSkeleton width={60} height={20} speed="fast" />
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <ShimmerSkeleton key={i} width="100%" height={80} rounded="lg" speed="fast" />
        ))}
      </div>
    </div>
  );
}

/**
 * Modern Pending Payments Card
 *
 * Displays invoice status distribution with urgency indicators:
 * - Overdue (red)
 * - Partially Paid / Unpaid (amber for urgency)
 * - Void (gray)
 * - Paid (green)
 *
 * Features Modern theme styling with View All link
 */
export function ModernPendingPayments({ distribution, isLoading }: ModernPendingPaymentsProps) {
  if (isLoading || !distribution) {
    return <PendingPaymentsSkeleton />;
  }

  const { overdue, unpaid, partiallyPaid, void: voidCount, paid } = distribution;
  const hasPendingPayments = overdue + unpaid + partiallyPaid > 0;

  return (
    <div className={cn(
      'rounded-xl border bg-white p-6 shadow-sm transition-all duration-200',
      'hover:shadow-md dark:bg-[#1E293B] dark:border-[#334155]'
    )}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0EA5E9]/10">
            <FileText className="h-5 w-5 text-[#0EA5E9]" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Pending Payments
          </h3>
        </div>
        <Link
          href="/billing"
          className="flex items-center gap-1 text-sm font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors"
        >
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Content */}
      {hasPendingPayments ? (
        <div className="space-y-3">
          {/* Overdue - Highest priority (red) */}
          {overdue > 0 && (
            <PaymentItem
              title="Overdue Invoices"
              count={overdue}
              variant="overdue"
              icon={AlertCircle}
            />
          )}

          {/* Partially Paid - Medium priority (amber) */}
          {partiallyPaid > 0 && (
            <PaymentItem
              title="Partially Paid"
              count={partiallyPaid}
              variant="due-soon"
              icon={Clock}
            />
          )}

          {/* Unpaid - Medium priority (amber) */}
          {unpaid > 0 && (
            <PaymentItem
              title="Unpaid Invoices"
              count={unpaid}
              variant="due-soon"
              icon={FileText}
            />
          )}

          {/* Void - Low priority (gray) */}
          {voidCount > 0 && (
            <PaymentItem
              title="Void Invoices"
              count={voidCount}
              variant="pending"
              icon={FileText}
            />
          )}

          {/* Paid - Success (green) */}
          {paid > 0 && (
            <PaymentItem
              title="Paid Invoices"
              count={paid}
              variant="paid"
              icon={CheckCircle2}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            All Caught Up!
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
            There are no pending payments at the moment. Great work keeping everything up to date!
          </p>
        </div>
      )}
    </div>
  );
}
