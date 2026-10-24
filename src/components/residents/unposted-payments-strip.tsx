'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentStatusBadge } from '@/components/payments/payment-status-badge';
import { usePayments } from '@/hooks/use-payments';
import { formatCurrency } from '@/lib/utils';

/**
 * Pending and failed payments create no wallet credit, so they never reach the
 * ledger. This strip keeps them visible above it (#1142) and hides when there
 * are none.
 */
export function UnpostedPaymentsStrip({ residentId }: { residentId: string }) {
  const pending = usePayments({ resident_id: residentId, status: 'pending', page: 1, limit: 20 });
  const failed = usePayments({ resident_id: residentId, status: 'failed', page: 1, limit: 20 });

  const payments = [...(pending.data?.data ?? []), ...(failed.data?.data ?? [])].sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date),
  );
  if (payments.length === 0) return null;

  return (
    <Card data-testid="unposted-payments">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Unposted payments ({payments.length})
        </p>
        <ul className="divide-y text-sm">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-muted-foreground">{format(new Date(payment.payment_date), 'MMM d, yyyy')}</span>
              <span className="font-medium">{formatCurrency(Number(payment.amount))}</span>
              <span className="capitalize text-muted-foreground">{payment.method?.replaceAll('_', ' ') ?? '-'}</span>
              <PaymentStatusBadge status={payment.status} />
              <Link href={`/payments/${payment.id}`} className="ml-auto text-xs text-primary hover:underline">
                View payment
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
