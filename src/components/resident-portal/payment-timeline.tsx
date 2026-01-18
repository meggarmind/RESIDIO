'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export interface PaymentTimelineItem {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: Date;
  amount: number;
  status: 'overdue' | 'due_soon' | 'upcoming';
  daysUntilDue: number;
  invoiceType?: string;
}

interface PaymentTimelineProps {
  items: PaymentTimelineItem[];
}

const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

function getStatusIcon(status: PaymentTimelineItem['status']) {
  switch (status) {
    case 'overdue':
      return AlertCircle;
    case 'due_soon':
      return Clock;
    case 'upcoming':
      return CheckCircle;
  }
}

function getStatusColor(status: PaymentTimelineItem['status']) {
  switch (status) {
    case 'overdue':
      return 'var(--color-error)';
    case 'due_soon':
      return 'var(--color-warning)';
    case 'upcoming':
      return 'var(--color-primary)';
  }
}

function getStatusLabel(item: PaymentTimelineItem): string {
  if (item.status === 'overdue') {
    return 'Overdue';
  }
  if (item.daysUntilDue === 0) {
    return 'Due today';
  }
  if (item.daysUntilDue === 1) {
    return 'Due tomorrow';
  }
  return `Due in ${item.daysUntilDue} days`;
}

/**
 * Payment Timeline Component
 *
 * Displays upcoming invoice payment due dates in a timeline format:
 * - Overdue invoices (red indicator)
 * - Due soon (orange indicator, <7 days)
 * - Upcoming (blue indicator, 7-30 days)
 *
 * Replaces the decorative calendar widget with actionable financial information.
 */
export function PaymentTimeline({ items }: PaymentTimelineProps) {
  if (items.length === 0) {
    return (
      <div className="card">
        <h3
          className="mb-4"
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          Upcoming Payments
        </h3>
        <p
          className="text-center py-8"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No upcoming payments
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          Upcoming Payments
        </h3>
        <Link
          href="/portal/invoices"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-primary)',
            fontWeight: 'var(--font-medium)',
            textDecoration: 'none',
          }}
        >
          View All
        </Link>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => {
          const StatusIcon = getStatusIcon(item.status);
          const statusColor = getStatusColor(item.status);

          return (
            <motion.div
              key={item.invoiceId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: index * 0.05 }}
            >
              <Link
                href={`/portal/invoices?invoice=${item.invoiceId}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className={cn(
                    "p-3 rounded-lg transition-all duration-200 cursor-pointer",
                    "hover:shadow-md hover:-translate-y-0.5"
                  )}
                  style={{
                    background: 'var(--color-bg-input)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-input)';
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 mt-0.5"
                      style={{
                        color: statusColor,
                      }}
                    >
                      <StatusIcon style={{ width: '16px', height: '16px' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p
                          className="truncate"
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: 'var(--font-semibold)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          <span className={cn(
                            "inline-block w-2 h-2 rounded-full mr-2",
                            item.status === 'overdue' ? "bg-destructive animate-pulse" : "bg-primary"
                          )} />
                          {item.invoiceType || 'Invoice'} #{item.invoiceNumber}
                        </p>
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: statusColor,
                            fontWeight: 'var(--font-medium)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getStatusLabel(item)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 'var(--text-lg)',
                          fontWeight: 'var(--font-bold)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {formatCurrency(item.amount)}
                      </p>
                      <p
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Due: {item.dueDate.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
