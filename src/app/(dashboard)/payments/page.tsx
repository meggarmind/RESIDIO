'use client';

import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { PaymentFilters } from '@/components/payments/payment-filters';
import { Pagination } from '@/components/ui/simple-pagination';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Plus, CreditCard, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { PaymentSearchParams } from '@/lib/validators/payment';
import { formatCurrency } from '@/lib/utils';
import { usePayments, usePaymentStats } from '@/hooks/use-payments';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { ModernPaymentsEmptyState } from '@/components/dashboard/modern-empty-state';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

function PaymentsContent() {
  const searchParams = useSearchParams();
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  // Parse URL params
  const page = Number(searchParams.get('page')) || 1;
  const limit = 20;

  const params: PaymentSearchParams = {
    page,
    limit,
    status: searchParams.get('status') as any,
    query: searchParams.get('query') as string,
    resident_id: searchParams.get('resident_id') as string,
    start_date: searchParams.get('start_date') as string,
    end_date: searchParams.get('end_date') as string,
  };

  // Client-side data fetching with React Query
  const { data: paymentsResult, isLoading: paymentsLoading } = usePayments(params);
  const { data: statsResult, isLoading: statsLoading } = usePaymentStats();

  const stats = statsResult?.stats || {
    total_collected: 0,
    pending_count: 0,
    overdue_count: 0,
    failed_count: 0,
  };

  const payments = paymentsResult?.data || [];
  const totalCount = paymentsResult?.count || 0;

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Payments"
        description="Track and manage all payment transactions"
        icon={CreditCard}
        actions={
          <Button
            asChild
            className={cn(
              isModern && 'rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white'
            )}
          >
            <Link href="/payments/new">
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          title="Total Collected"
          value={formatCurrency(stats.total_collected)}
          icon={CreditCard}
          isLoading={statsLoading}
          description="Lifetime revenue"
          accentColor="success"
        />
        <EnhancedStatCard
          title="Completed"
          value={stats.pending_count > 0 ? `${Math.max(0, (paymentsResult?.count || 0) - stats.pending_count)}` : '0'}
          icon={CheckCircle}
          isLoading={statsLoading}
          description="Successful transactions"
          accentColor="success"
        />
        <EnhancedStatCard
          title="Pending"
          value={stats.pending_count}
          icon={Clock}
          isLoading={statsLoading}
          description="Awaiting payment"
          accentColor={stats.pending_count > 0 ? 'warning' : 'default'}
        />
        <EnhancedStatCard
          title="Overdue"
          value={stats.overdue_count}
          icon={AlertCircle}
          isLoading={statsLoading}
          description="Requires attention"
          accentColor={stats.overdue_count > 0 ? 'danger' : 'default'}
        />
      </div>

      <EnhancedTableCard
        title="Recent Transactions"
        description="View and manage payment records"
      >
        <PaymentFilters />

        {paymentsResult?.error ? (
          <div className={cn(
            'text-red-500 py-4',
            isModern && 'bg-red-50 dark:bg-red-900/20 rounded-xl p-4'
          )}>
            Error: {paymentsResult.error}
          </div>
        ) : paymentsLoading ? (
          <div className={cn(
            'py-8 text-center text-muted-foreground',
            isModern && 'bg-gray-50 dark:bg-[#0F172A] rounded-xl'
          )}>
            Loading payments...
          </div>
        ) : payments.length === 0 ? (
          <ModernPaymentsEmptyState />
        ) : (
          <>
            <PaymentTable data={payments} />
            <Pagination currentPage={page} totalCount={totalCount} pageSize={limit} />
          </>
        )}
      </EnhancedTableCard>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}
