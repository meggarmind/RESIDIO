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
    <div className="rounded-xl border bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155] h-[270px]">
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
      'rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 h-[270px] flex flex-col',
      'hover:shadow-md dark:bg-[#1E293B] dark:border-[#334155]'
    )}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0EA5E9]/10">
          <CircleDollarSign className="h-4 w-4 text-[#0EA5E9]" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Financial Health
        </h3>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden min-h-0">
        {/* Left: Collection Rate Progress Ring */}
        <div className="flex flex-col items-center justify-center gap-2 shrink-0">
          <ProgressRing
            value={clampedRate}
            size={110}
            strokeWidth={10}
            duration={1200}
            color="hsl(199 89% 48%)" // #0EA5E9 blue-teal
            gradientColor="hsl(189 94% 43%)" // #06B6D4 cyan
            label="COLLECTION"
          />
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">
              ₦{formatCurrency(totalCollected)}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">collected</p>
          </div>
        </div>

        {/* Right: 2x2 Metrics Grid */}
        <div className="flex-1 grid gap-2 grid-cols-2 min-h-0">
          {/* Outstanding Balance */}
          <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-900/10 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 leading-tight">
                Outstanding Balance
              </p>
            </div>
            <AnimatedCounter
              value={totalOutstanding}
              prefix="₦"
              formatNumber
              className="text-lg font-bold text-amber-900 dark:text-amber-100"
              duration={800}
            />
          </div>

          {/* Monthly Revenue */}
          <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-[#0F172A] flex flex-col justify-between min-h-0">
            <div className="flex items-center justify-between mb-1 gap-1">
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-tight">
                Monthly Revenue
              </p>
              <div className={cn(
                'flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-semibold shrink-0',
                isRevenueUp
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {isRevenueUp ? (
                  <TrendingUp className="h-2.5 w-2.5" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" />
                )}
                <span>{Math.abs(revenueChange).toFixed(1)}%</span>
              </div>
            </div>
            <AnimatedCounter
              value={monthlyRevenue}
              prefix="₦"
              formatNumber
              className="text-lg font-bold text-gray-900 dark:text-white"
              duration={800}
            />
          </div>

          {/* Overdue Amount */}
          <div className={cn(
            'rounded-lg p-2.5 flex flex-col justify-between min-h-0',
            overdueAmount > 0
              ? 'bg-red-50 dark:bg-red-900/10'
              : 'bg-gray-50 dark:bg-[#0F172A]'
          )}>
            <p className={cn(
              'text-[10px] font-medium mb-1 leading-tight',
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
                'text-lg font-bold',
                overdueAmount > 0
                  ? 'text-red-900 dark:text-red-100'
                  : 'text-gray-900 dark:text-white'
              )}
              duration={800}
            />
          </div>

          {/* Wallet Credits */}
          <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/10 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-[10px] font-medium text-green-700 dark:text-green-300 leading-tight">
                Wallet Credits
              </p>
            </div>
            <AnimatedCounter
              value={totalWalletBalance}
              prefix="₦"
              formatNumber
              className="text-lg font-bold text-green-900 dark:text-green-100"
              duration={800}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
