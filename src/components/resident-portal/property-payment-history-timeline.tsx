'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Receipt, Wallet, CreditCard, ArrowRight, DollarSign, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import type { PaymentRecord } from '@/types/database';

/**
 * Property Payment History Timeline Component
 *
 * Displays last 10 payments for the current resident at this property.
 * Shows date, amount, payment method (wallet/Paystack), and invoice reference.
 *
 * Features:
 * - Vertical timeline/stepper format
 * - Payment method icons (wallet vs online)
 * - Color-coded timeline dots
 * - Invoice number links
 * - Empty state handling
 * - Scrollable for longer histories
 */

interface PropertyPaymentHistoryTimelineProps {
  /** Last 10 payments for current user at this property */
  payments: PaymentRecord[];
  /** Loading state */
  isLoading?: boolean;
  /** Property ID for "View All" link */
  houseId: string;
  className?: string;
}

export function PropertyPaymentHistoryTimeline({
  payments,
  isLoading = false,
  houseId,
  className,
}: PropertyPaymentHistoryTimelineProps) {
  // Get payment method details
  const getPaymentMethodInfo = (payment: PaymentRecord) => {
    const method = payment.method?.toLowerCase();

    if (method === 'wallet') {
      return {
        icon: <Wallet className="w-4 h-4" />,
        label: 'Wallet',
        colorClass: 'text-blue-600 dark:text-blue-400',
      };
    }

    if (method === 'paystack' || method === 'online') {
      return {
        icon: <CreditCard className="w-4 h-4" />,
        label: 'Online',
        colorClass: 'text-green-600 dark:text-green-400',
      };
    }

    return {
      icon: <DollarSign className="w-4 h-4" />,
      label: method || 'Cash',
      colorClass: 'text-gray-600 dark:text-gray-400',
    };
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (payments.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Receipt
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Payment History
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-bg-muted)',
            }}
          >
            <Receipt
              style={{
                width: '24px',
                height: '24px',
                color: 'var(--color-text-muted)',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            No payment history yet
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg p-6 border',
        'bg-card',
        className
      )}
      style={{
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--color-text-primary)',
            }}
          >
            Payment History
          </h3>
        </div>
        <Badge
          variant="secondary"
          style={{
            fontSize: 'var(--text-xs)',
          }}
        >
          {payments.length}
        </Badge>
      </div>

      {/* Timeline */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {payments.map((payment, index) => {
          const methodInfo = getPaymentMethodInfo(payment);

          return (
            <div
              key={payment.id}
              className={cn(
                'relative pl-4 pb-3',
                index < payments.length - 1 && 'border-l-2'
              )}
              style={{
                borderColor: index < payments.length - 1 ? 'var(--color-border)' : 'transparent',
              }}
            >
              {/* Timeline Dot */}
              <div
                className="absolute left-[-5px] top-[6px] w-2.5 h-2.5 rounded-full flex items-center justify-center"
                style={{
                  background: 'var(--color-success)',
                }}
              >
                <CheckCircle2
                  className="absolute w-4 h-4"
                  style={{ color: 'var(--color-success)' }}
                />
              </div>

              {/* Payment Content */}
              <div
                className={cn(
                  "rounded-lg p-4 transition-all duration-200",
                  "hover:shadow-md hover:-translate-y-0.5"
                )}
                style={{
                  background: 'var(--color-bg-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Amount + Date */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p
                      className="text-lg font-bold"
                      style={{
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {formatCurrency(payment.amount || 0)}
                    </p>
                    <p
                      className="text-xs"
                      style={{
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {payment.payment_date && format(new Date(payment.payment_date), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>

                  {/* Payment Method Badge */}
                  <Badge variant="outline" className="text-xs shrink-0">
                    <div className={cn('flex items-center gap-1', methodInfo.colorClass)}>
                      {methodInfo.icon}
                      {methodInfo.label}
                    </div>
                  </Badge>
                </div>

                {/* Reference Number (if available) */}
                {payment.reference && (
                  <p
                    className="text-xs mt-1"
                    style={{
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Ref: {payment.reference}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* View All Link */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <Link
          href={`/portal/payments?house=${houseId}`}
          className="flex items-center justify-between text-sm hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          <span>View All Payments</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
