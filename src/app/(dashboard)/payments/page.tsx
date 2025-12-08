import { PaymentTable } from '@/components/payments/payment-table';
import { getPayments } from '@/actions/payments/get-payments';
import { getPaymentStats } from '@/actions/payments/get-payment-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PaymentFilters } from '@/components/payments/payment-filters';
import { Pagination } from '@/components/ui/simple-pagination';
import Link from 'next/link';
import { Plus, CreditCard, AlertCircle, Clock } from 'lucide-react';
import { PaymentSearchParams } from '@/lib/validators/payment';
import { formatCurrency } from '@/lib/utils';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const page = Number(resolvedParams.page) || 1;
  const limit = 20;

  // Cast searchParams to PaymentSearchParams roughly
  const params: PaymentSearchParams = {
    page,
    limit,
    status: resolvedParams.status as any,
    query: resolvedParams.query as string,
    // resident_id, start_date etc can be added later if UI supports them
  };

  const [paymentsResult, statsResult] = await Promise.all([
    getPayments(params),
    getPaymentStats(),
  ]);

  const stats = statsResult.stats || {
    total_collected: 0,
    pending_count: 0,
    overdue_count: 0,
    failed_count: 0
  };

  const payments = paymentsResult.data || [];
  const totalCount = paymentsResult.count || 0;

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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.total_collected)}</div>
            <p className="text-xs text-muted-foreground">Lifetime revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending_count}</div>
            <p className="text-xs text-muted-foreground">Awaiting payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overdue_count}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.failed_count}</div>
            <p className="text-xs text-muted-foreground">Transaction errors</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentFilters />

          {paymentsResult.error ? (
            <div className="text-red-500 py-4">Error: {paymentsResult.error}</div>
          ) : (
            <>
              <PaymentTable data={payments} />
              <Pagination
                currentPage={page}
                totalCount={totalCount}
                pageSize={limit}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
