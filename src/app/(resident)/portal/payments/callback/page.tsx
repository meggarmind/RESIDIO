'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  FileText,
  Loader2,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { verifyPaystackPayment } from '@/actions/paystack';
import { getChannelDisplayName } from '@/lib/paystack';
import { PaymentResult } from '@/components/payments/payment-result';
import type { PaystackTransactionStatus } from '@/lib/paystack';

// Status configuration
const statusConfig: Record<
  PaystackTransactionStatus,
  {
    icon: React.ElementType;
    title: string;
    description: string;
    color: string;
    bgColor: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    title: 'Payment Successful!',
    description: 'Your payment has been processed and your account has been credited.',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10',
  },
  failed: {
    icon: XCircle,
    title: 'Payment Failed',
    description: 'We were unable to process your payment. Please try again.',
    color: 'text-red-600',
    bgColor: 'bg-red-500/10',
  },
  pending: {
    icon: Clock,
    title: 'Payment Pending',
    description: 'Your payment is being processed. This may take a few moments.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
  },
  abandoned: {
    icon: AlertCircle,
    title: 'Payment Cancelled',
    description: 'The payment was not completed. You can try again when ready.',
    color: 'text-gray-600',
    bgColor: 'bg-gray-500/10',
  },
  reversed: {
    icon: AlertCircle,
    title: 'Payment Reversed',
    description: 'This payment has been reversed. Please contact support for details.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10',
  },
};

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<PaystackTransactionStatus | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<{
    amount: number;
    reference: string;
    channel: string | null;
    paid_at: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reference = searchParams.get('reference') || searchParams.get('trxref');

  useEffect(() => {
    async function verifyPayment() {
      if (!reference) {
        setError('No payment reference found');
        setIsLoading(false);
        return;
      }

      try {
        const result = await verifyPaystackPayment(reference);

        if (result.data) {
          setStatus(result.data.status);
          setPaymentDetails({
            amount: result.data.amount,
            reference: result.data.reference,
            channel: result.data.channel,
            paid_at: result.data.paid_at,
          });
        }

        if (!result.success && result.error) {
          setError(result.error);
        }
      } catch (err) {
        console.error('Verification error:', err);
        setError('Failed to verify payment status');
      } finally {
        setIsLoading(false);
      }
    }

    verifyPayment();
  }, [reference]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Verifying Payment</h2>
                <p className="text-sm text-muted-foreground">
                  Please wait while we confirm your payment...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state (no reference or verification failed)
  if (error && !status) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-full bg-red-500/10">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Verification Error</h2>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={() => router.push('/portal/invoices')}>
                  View Invoices
                </Button>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Status result
  const config = status ? statusConfig[status] : statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <PaymentResult
        status={status === 'abandoned' ? 'cancelled' : status === 'reversed' ? 'failed' : status || 'pending'}
        title={config.title}
        description={config.description}
        amount={paymentDetails?.amount}
        reference={paymentDetails?.reference}
        paymentMethod={paymentDetails?.channel ? getChannelDisplayName(paymentDetails.channel) : undefined}
        date={paymentDetails?.paid_at ? new Date(paymentDetails.paid_at).toLocaleString('en-NG', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }) : undefined}
        primaryAction={{
          label: 'View Invoices',
          onClick: () => router.push('/portal/invoices'),
          icon: FileText
        }}
        secondaryAction={
          (status === 'failed' || status === 'abandoned') ? {
            label: 'Try Again',
            onClick: () => router.back(),
            icon: RefreshCw
          } : undefined
        }
      />
    </div>
  );
}

/**
 * Payment Callback Page
 *
 * This page handles the return from Paystack after a payment attempt.
 * It verifies the transaction and displays the result.
 *
 * URL parameters:
 * - reference or trxref: The Paystack transaction reference
 */
export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
