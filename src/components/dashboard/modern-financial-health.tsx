'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown, AlertTriangle, Wallet, CircleDollarSign } from 'lucide-react';
import { ProgressRing } from '@/components/ui/progress-ring';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import type { FinancialHealthMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';

interface ModernFinancialHealthProps {
  financialHealth: FinancialHealthMetrics | null;
  isLoading?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function FinancialHealthSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155]">
      <ShimmerSkeleton width={144} height={24} className="mb-4" speed="fast" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex flex-col items-center gap-2">
          <ShimmerSkeleton width={140} height={140} rounded="full" speed="normal" />
        </div>
        <div className="flex-1 grid gap-3 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <ShimmerSkeleton key={i} width="100%" height={80} rounded="lg" speed="fast" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Modern Financial Health Card
 *
 * Left section: circular collection rate progress indicator
 * Right section: 2x2 grid of financial metrics
 * Features Modern theme styling with blue-teal accents
 */
export function ModernFinancialHealth({ financialHealth, isLoading }: ModernFinancialHealthProps) {
  if (isLoading || !financialHealth) {
    return <FinancialHealthSkeleton />;
  }

  const {
    totalOutstanding,
    collectionRate,
    monthlyRevenue,
    previousMonthRevenue,
    revenueChange,
    overdueAmount,
    totalWalletBalance,
    totalCollected,
  } = financialHealth;

  const clampedRate = Math.min(Math.max(collectionRate, 0), 100);
  const isRevenueUp = revenueChange >= 0;

  return (
    <div className={cn(
      'rounded-xl border bg-white p-6 shadow-sm transition-all duration-200',
      'hover:shadow-md dark:bg-[#1E293B] dark:border-[#334155]'
    )}>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0EA5E9]/10">
          <CircleDollarSign className="h-5 w-5 text-[#0EA5E9]" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Financial Health
        </h3>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Collection Rate Progress Ring */}
        <div className="flex flex-col items-center gap-3">
          <ProgressRing
            value={clampedRate}
            size={140}
            strokeWidth={12}
            duration={1200}
            color="hsl(199 89% 48%)" // #0EA5E9 blue-teal
            gradientColor="hsl(189 94% 43%)" // #06B6D4 cyan
            label="COLLECTION"
          />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              ₦{formatCurrency(totalCollected)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">collected</p>
          </div>
        </div>

        {/* Right: 2x2 Metrics Grid */}
        <div className="flex-1 grid gap-3 sm:grid-cols-2">
          {/* Outstanding Balance */}
          <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/10">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Outstanding Balance
              </p>
            </div>
            <AnimatedCounter
              value={totalOutstanding}
              prefix="₦"
              formatNumber
              className="text-2xl font-bold text-amber-900 dark:text-amber-100"
              duration={800}
            />
          </div>

          {/* Monthly Revenue */}
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-[#0F172A]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Monthly Revenue
              </p>
              <div className={cn(
                'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                isRevenueUp
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {isRevenueUp ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{Math.abs(revenueChange).toFixed(1)}%</span>
              </div>
            </div>
            <AnimatedCounter
              value={monthlyRevenue}
              prefix="₦"
              formatNumber
              className="text-2xl font-bold text-gray-900 dark:text-white"
              duration={800}
            />
          </div>

          {/* Overdue Amount */}
          <div className={cn(
            'rounded-lg p-4',
            overdueAmount > 0
              ? 'bg-red-50 dark:bg-red-900/10'
              : 'bg-gray-50 dark:bg-[#0F172A]'
          )}>
            <p className={cn(
              'text-xs font-medium mb-2',
              overdueAmount > 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-gray-600 dark:text-gray-400'
            )}>
              Overdue Amount
            </p>
            <AnimatedCounter
              value={overdueAmount}
              prefix="₦"
              formatNumber
              className={cn(
                'text-2xl font-bold',
                overdueAmount > 0
                  ? 'text-red-900 dark:text-red-100'
                  : 'text-gray-900 dark:text-white'
              )}
              duration={800}
            />
          </div>

          {/* Wallet Credits */}
          <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/10">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-medium text-green-700 dark:text-green-300">
                Wallet Credits
              </p>
            </div>
            <AnimatedCounter
              value={totalWalletBalance}
              prefix="₦"
              formatNumber
              className="text-2xl font-bold text-green-900 dark:text-green-100"
              duration={800}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
