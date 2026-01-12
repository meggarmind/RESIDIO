'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface FinancialStat {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: 'blue' | 'pink' | 'purple' | 'orange' | 'green' | 'cyan';
  href?: string;
}

interface FinancialSummaryStatsProps {
  stats: FinancialStat[];
}

const iconColorMap = {
  pink: 'var(--color-icon-bg-pink)',
  blue: 'var(--color-icon-bg-blue)',
  purple: 'var(--color-icon-bg-purple)',
  orange: 'var(--color-icon-bg-orange)',
  green: 'var(--color-icon-bg-green)',
  cyan: 'var(--color-icon-bg-cyan)',
};

const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

/**
 * Financial Summary Stats Component
 *
 * Displays a 2x2 grid of financial metrics relevant to residents:
 * - Overdue invoices (amount + count)
 * - Due soon (amount + count)
 * - Paid this month (amount + count)
 * - Wallet balance
 *
 * Replaces the generic "Users/Clicks/Sales/Items" placeholder in the dashboard.
 */
export function FinancialSummaryStats({ stats }: FinancialSummaryStatsProps) {
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
        Financial Summary
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const content = (
            <motion.div
              key={stat.label}
              className="p-4 rounded-lg transition-colors duration-150"
              style={{
                background: 'var(--color-bg-input)',
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: index * 0.05 }}
              whileHover={{
                background: 'var(--color-bg-secondary)',
                scale: 1.02,
              }}
            >
              <div
                className="flex items-center justify-center mb-2 mx-auto"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  background: iconColorMap[stat.iconColor],
                }}
              >
                <Icon
                  style={{
                    width: '16px',
                    height: '16px',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <p
                className="text-center mb-1"
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 'var(--font-bold)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {typeof stat.value === 'number' ? formatCurrency(stat.value) : stat.value}
              </p>
              <p
                className="text-center"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  lineHeight: '1.2',
                }}
              >
                {stat.label}
              </p>
              {stat.subtitle && (
                <p
                  className="text-center mt-1"
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {stat.subtitle}
                </p>
              )}
            </motion.div>
          );

          // If href is provided, wrap in a clickable link
          if (stat.href) {
            return (
              <a
                key={stat.label}
                href={stat.href}
                className="block cursor-pointer"
                style={{ textDecoration: 'none' }}
              >
                {content}
              </a>
            );
          }

          return content;
        })}
      </div>
    </div>
  );
}
