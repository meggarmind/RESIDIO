'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import type { Invoice } from '@/types/database';

interface InvoiceStatusPopoverProps {
  invoices: Invoice[];
  totalOwed: number;
  isLoading: boolean;
  onClose: () => void;
}

export function InvoiceStatusPopover({
  invoices,
  totalOwed,
  isLoading,
  onClose,
}: InvoiceStatusPopoverProps) {
  // Get urgency status
  const getInvoiceUrgency = (invoice: Invoice) => {
    if (invoice.status === 'overdue') return 'overdue';

    const now = Date.now();
    const dueDate = new Date(invoice.due_date || '').getTime();
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilDue <= 7 && daysUntilDue >= 0) return 'due-soon';
    return 'unpaid';
  };

  // Get badge variant based on status
  const getBadgeVariant = (urgency: string) => {
    switch (urgency) {
      case 'overdue':
        return 'destructive';
      case 'due-soon':
        return 'warning';
      default:
        return 'secondary';
    }
  };

  // Get summary message
  const getSummaryMessage = () => {
    const overdueCount = invoices.filter((inv) => inv.status === 'overdue').length;
    if (overdueCount > 0) {
      const plural = overdueCount !== 1 ? 's' : '';
      return `You have ${overdueCount} overdue invoice${plural} totaling ${formatCurrency(totalOwed)}`;
    }

    const dueSoonCount = invoices.filter(
      (inv) => getInvoiceUrgency(inv) === 'due-soon'
    ).length;
    if (dueSoonCount > 0) {
      const plural = dueSoonCount !== 1 ? 's' : '';
      return `You have ${dueSoonCount} invoice${plural} due soon totaling ${formatCurrency(totalOwed)}`;
    }

    const plural = invoices.length !== 1 ? 's' : '';
    return `You have ${invoices.length} unpaid invoice${plural} totaling ${formatCurrency(totalOwed)}`;
  };

  // Get summary color
  const getSummaryColor = () => {
    const hasOverdue = invoices.some((inv) => inv.status === 'overdue');
    if (hasOverdue) return 'var(--color-error)';

    const hasDueSoon = invoices.some((inv) => getInvoiceUrgency(inv) === 'due-soon');
    if (hasDueSoon) return 'var(--color-warning)';

    return 'var(--color-text-secondary)';
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
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
      <div className="p-8 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{
            background: 'var(--color-bg-input)',
          }}
        >
          <FileText
            style={{
              width: '24px',
              height: '24px',
              color: 'var(--color-text-muted)',
            }}
          />
        </div>
        <p
          className="font-medium mb-1"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)',
          }}
        >
          All caught up!
        </p>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          You have no unpaid invoices
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h3
            className="font-semibold"
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--color-text-primary)',
            }}
          >
            Unpaid Invoices
          </h3>
          <Badge
            variant="secondary"
            style={{
              fontSize: 'var(--text-xs)',
            }}
          >
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        {/* Summary Card */}
        <div
          className="rounded-lg p-3"
          style={{
            background: 'var(--color-bg-muted)',
            border: '1px solid var(--color-bg-input)',
          }}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: getSummaryColor(),
              fontWeight: 'var(--font-medium)',
            }}
          >
            {getSummaryMessage()}
          </p>
        </div>
      </div>

      <Separator />

      {/* Invoice List */}
      <div className="p-2 space-y-1 max-h-[240px] overflow-y-auto">
        {invoices.map((invoice) => {
          const urgency = getInvoiceUrgency(invoice);
          return (
            <Link
              key={invoice.id}
              href={`/portal/invoices?id=${invoice.id}`}
              onClick={onClose}
              className={cn(
                'block p-3 rounded-lg transition-colors',
                'hover:bg-muted/50 cursor-pointer'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium truncate mb-1"
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Invoice #{invoice.invoice_number}
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Due {format(new Date(invoice.due_date || ''), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p
                    className="font-semibold"
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {formatCurrency(invoice.amount_due || 0)}
                  </p>
                  <Badge variant={getBadgeVariant(urgency)} className="text-xs">
                    {invoice.status === 'overdue'
                      ? 'Overdue'
                      : urgency === 'due-soon'
                        ? 'Due Soon'
                        : 'Unpaid'}
                  </Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <Separator />

      {/* Footer */}
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          asChild
          onClick={onClose}
        >
          <Link href="/portal/invoices">
            <span style={{ fontSize: 'var(--text-sm)' }}>View All Invoices</span>
            <ArrowRight
              style={{
                width: '16px',
                height: '16px',
              }}
            />
          </Link>
        </Button>
      </div>
    </div>
  );
}
