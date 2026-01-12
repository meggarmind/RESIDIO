'use client';

import * as React from 'react';
import { Wallet, Receipt, CheckCircle2, FileText } from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { formatCurrency, cn } from '@/lib/utils';
import type { Invoice } from '@/types/database';

/**
 * Property Financial Summary Card Component
 *
 * Displays 4 key financial metrics for the current resident at this property:
 * 1. Outstanding Balance - Total unpaid/overdue invoices
 * 2. Wallet Balance - Available funds in wallet
 * 3. Total Paid - Sum of all completed payments
 * 4. Invoice Count - Total number of invoices for this property
 *
 * Design: 2x2 grid on mobile, 1x4 horizontal on desktop
 * Uses: AnimatedCounter for smooth number transitions
 */

interface PropertyFinancialSummaryCardProps {
  /** User's invoices for this property only */
  invoices: Invoice[];
  /** Outstanding balance (unpaid + partially_paid + overdue) */
  outstanding: number;
  /** Current wallet balance */
  walletBalance: number;
  /** Total paid to date */
  totalPaid: number;
  /** Loading state */
  isLoading?: boolean;
  className?: string;
}

interface MetricItem {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

export function PropertyFinancialSummaryCard({
  invoices,
  outstanding,
  walletBalance,
  totalPaid,
  isLoading = false,
  className,
}: PropertyFinancialSummaryCardProps) {
  const invoiceCount = invoices.length;

  // Define metrics
  const metrics: MetricItem[] = [
    {
      label: 'Outstanding',
      value: outstanding,
      icon: <Receipt style={{ width: '20px', height: '20px' }} />,
      colorClass: outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
      bgClass: outstanding > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Wallet Balance',
      value: walletBalance,
      icon: <Wallet style={{ width: '20px', height: '20px' }} />,
      colorClass: 'text-blue-600 dark:text-blue-400',
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Total Paid',
      value: totalPaid,
      icon: <CheckCircle2 style={{ width: '20px', height: '20px' }} />,
      colorClass: 'text-green-600 dark:text-green-400',
      bgClass: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Invoices',
      value: invoiceCount,
      icon: <FileText style={{ width: '20px', height: '20px' }} />,
      colorClass: 'text-purple-600 dark:text-purple-400',
      bgClass: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div
                className="h-4 rounded animate-pulse"
                style={{ background: 'var(--color-bg-muted)' }}
              />
              <div
                className="h-8 rounded animate-pulse"
                style={{ background: 'var(--color-bg-muted)' }}
              />
            </div>
          ))}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <div key={index} className="space-y-2">
            {/* Icon + Label */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  metric.bgClass
                )}
              >
                <div className={metric.colorClass}>{metric.icon}</div>
              </div>
              <p
                className="text-sm font-medium"
                style={{
                  color: 'var(--color-text-secondary)',
                }}
              >
                {metric.label}
              </p>
            </div>

            {/* Value */}
            <div
              className={cn('text-2xl font-bold', metric.colorClass)}
            >
              {metric.label === 'Invoices' ? (
                <AnimatedCounter value={metric.value} />
              ) : (
                <AnimatedCounter
                  value={metric.value}
                  formatter={(val) => formatCurrency(val)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
