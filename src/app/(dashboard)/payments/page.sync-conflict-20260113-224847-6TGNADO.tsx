'use client';

import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentFilters } from '@/components/payments/payment-filters';
import { Pagination } from '@/components/ui/simple-pagination';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Plus, CreditCard, AlertCircle, Clock } from 'lucide-react';
import { PaymentSearchParams } from '@/lib/validators/payment';
import { formatCurrency } from '@/lib/utils';
import { usePayments, usePaymentStats } from '@/hooks/use-payments';

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  isLoading: boolean;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function PaymentsContent() {
  const searchParams = useSearchParams();

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <Button asChild>
          <Link href="/payments/new">
            <Plus className="mr-2 h-4 w-4" /> Record Payment
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Collected"
          value={formatCurrency(stats.total_collected)}
          icon={CreditCard}
          isLoading={statsLoading}
          description="Lifetime revenue"
        />
        <StatCard
          title="Pending"
          value={stats.pending_count}
          icon={Clock}
          isLoading={statsLoading}
          description="Awaiting payment"
        />
        <StatCard
          title="Overdue"
          value={stats.overdue_count}
          icon={AlertCircle}
          isLoading={statsLoading}
          description="Requires attention"
        />
        <StatCard
          title="Failed"
          value={stats.failed_count}
          icon={AlertCircle}
          isLoading={statsLoading}
          description="Transaction errors"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentFilters />

          {paymentsResult?.error ? (
            <div className="text-red-500 py-4">Error: {paymentsResult.error}</div>
          ) : paymentsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading payments...</div>
          ) : (
            <>
              <PaymentTable data={payments} />
              <Pagination currentPage={page} totalCount={totalCount} pageSize={limit} />
            </>
          )}
        </CardContent>
      </Card>
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
