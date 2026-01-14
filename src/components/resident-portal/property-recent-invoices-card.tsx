'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, FileText, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import type { Invoice } from '@/types/database';

/**
 * Property Recent Invoices Card Component
 *
 * Displays last 5 invoices for the current resident at this property.
 * Shows invoice number, due date, amount, status badge, and "Pay Now" button.
 *
 * Features:
 * - Compact table layout
 * - "Pay Now" button for unpaid/partially_paid/overdue invoices
 * - Color-coded status badges
 * - Empty state handling
 * - Links to invoice detail page
 */

interface PropertyRecentInvoicesCardProps {
  /** Last 5 invoices for current user at this property */
  invoices: Invoice[];
  /** Loading state */
  isLoading?: boolean;
  /** Callback when user clicks "Pay Now" */
  onPayNow: (invoice: Invoice) => void;
  /** Property ID for "View All" link */
  houseId: string;
  className?: string;
}

export function PropertyRecentInvoicesCard({
  invoices,
  isLoading = false,
  onPayNow,
  houseId,
  className,
}: PropertyRecentInvoicesCardProps) {
  // Get badge variant based on status
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'overdue':
        return 'destructive';
      case 'partially_paid':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  // Format status for display
  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Check if invoice can be paid
  const canPay = (invoice: Invoice) => {
    return ['unpaid', 'partially_paid', 'overdue'].includes(invoice.status || '');
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
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (invoices.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg p-6 border',
          'bg-card',
          className
        )}
        style={{
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <FileText
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'hsl(var(--foreground))',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'hsl(var(--foreground))',
            }}
          >
            Recent Invoices
          </h3>
        </div>
        <div className="text-center py-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--muted)'
              ,
            }}
          >
            <FileText
              style={{
                width: '24px',
                height: '24px',
                color: 'var(--muted-foreground)'
                ,
              }}
            />
          </div>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--muted-foreground)',
            }}
          >
            No invoices for this property yet
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
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText
            style={{
              width: 'var(--icon-sm)',
              height: 'var(--icon-sm)',
              color: 'hsl(var(--foreground))',
            }}
          />
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--foreground)',
            }}
          >
            Recent Invoices
          </h3>
        </div>
        <Badge
          variant="secondary"
          style={{
            fontSize: 'var(--text-xs)',
          }}
        >
          {invoices.length}
        </Badge>
      </div>

      {/* Invoice List */}
      <div className="space-y-3">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className={cn(
              'flex items-center justify-between gap-4 p-3 rounded-lg',
              'transition-colors hover:bg-muted/50'
            )}
            style={{
              border: '1px solid var(--border)',
            }}
          >
            {/* Invoice Details */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/portal/invoices?id=${invoice.id}`}
                className="block group"
              >
                <p
                  className="font-medium truncate group-hover:underline"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--foreground)',
                  }}
                >
                  Invoice #{invoice.invoice_number}
                </p>
                <p
                  className="text-xs"
                  style={{
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Due {format(new Date(invoice.due_date || ''), 'MMM d, yyyy')}
                </p>
              </Link>
            </div>

            {/* Amount + Status */}
            <div className="flex flex-col items-end gap-1">
              <p
                className="font-semibold"
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'hsl(var(--foreground))',
                }}
              >
                {formatCurrency(invoice.amount_due || 0)}
              </p>
              <Badge variant={getStatusVariant(invoice.status || 'unpaid')} className="text-xs">
                {formatStatus(invoice.status || 'unpaid')}
              </Badge>
            </div>

            {/* Pay Now Button */}
            {canPay(invoice) && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onPayNow(invoice);
                }}
                className="shrink-0"
              >
                <CreditCard className="w-4 h-4 mr-1" />
                Pay Now
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* View All Link */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <Link
          href={`/portal/invoices?house=${houseId}`}
          className="flex items-center justify-between text-sm hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          <span>View All Invoices</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
