'use client';

import { Wallet, FileText, Shield, TrendingUp, TrendingDown } from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import type { FinancialHealthMetrics, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';

interface ModernStatsCardsProps {
  financialHealth: FinancialHealthMetrics | null;
  quickStats: QuickStats | null;
  unpaidCount: number;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  mainValue: number;
  valuePrefix?: string;
  valueSuffix?: string;
  secondaryLabel: string;
  secondaryValue: number | string;
  percentageChange?: number;
  icon: React.ElementType;
  iconColor: string;
  iconBgColor: string;
}

function StatCard({
  title,
  mainValue,
  valuePrefix,
  valueSuffix,
  secondaryLabel,
  secondaryValue,
  percentageChange,
  icon: Icon,
  iconColor,
  iconBgColor,
}: StatCardProps) {
  const isPositive = percentageChange !== undefined && percentageChange >= 0;

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border bg-white p-6 shadow-sm transition-all duration-200',
      // Modern theme: generous border radius, subtle shadows
      'hover:shadow-md dark:bg-[#1E293B] dark:border-[#334155]',
      // Modern theme: blue-teal accent border top
      'border-t-4 border-t-[#0EA5E9]'
    )}>
      {/* Icon */}
      <div className="mb-4 flex items-center justify-between">
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          iconBgColor
        )}>
          <Icon className={cn('h-6 w-6', iconColor)} />
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </p>

      {/* Main Value */}
      <div className="flex items-baseline gap-2 mb-3">
        {valuePrefix && (
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            {valuePrefix}
          </span>
        )}
        <AnimatedCounter
          value={mainValue}
          className="text-3xl font-bold text-gray-900 dark:text-white"
          duration={1000}
        />
        {valueSuffix && (
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {valueSuffix}
          </span>
        )}
      </div>

      {/* Secondary Info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {secondaryLabel}:{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {typeof secondaryValue === 'number' ? (
              <AnimatedCounter value={secondaryValue} duration={800} />
            ) : (
              secondaryValue
            )}
          </span>
        </p>

        {/* Percentage Badge */}
        {percentageChange !== undefined && (
          <div className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
            isPositive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          )}>
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{Math.abs(percentageChange).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155]"
        >
          <div className="mb-4 flex items-center justify-between">
            <ShimmerSkeleton width={48} height={48} rounded="xl" speed="fast" />
          </div>
          <ShimmerSkeleton width={80} height={16} className="mb-2" speed="fast" />
          <ShimmerSkeleton width={120} height={36} className="mb-3" speed="fast" />
          <div className="flex items-center justify-between">
            <ShimmerSkeleton width={100} height={14} speed="fast" />
            <ShimmerSkeleton width={60} height={24} rounded="full" speed="fast" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Modern Theme Stats Cards
 *
 * Three-card row displaying:
 * 1. Total Wallet Balance (with monthly collection comparison)
 * 2. Unpaid Invoices (with outstanding amount)
 * 3. Security Contacts (with active count)
 *
 * Features Modern theme styling with blue-teal accents, generous spacing,
 * and percentage indicators with semantic colors.
 */
export function ModernStatsCards({
  financialHealth,
  quickStats,
  unpaidCount,
  isLoading,
}: ModernStatsCardsProps) {
  if (isLoading || !financialHealth || !quickStats) {
    return <StatsCardsSkeleton />;
  }

  // Calculate this month's collection percentage change
  const collectionChange = financialHealth.previousMonthRevenue > 0
    ? ((financialHealth.monthlyRevenue - financialHealth.previousMonthRevenue) / financialHealth.previousMonthRevenue) * 100
    : 0;

  // Format currency values
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="grid gap-6 md:grid-cols-3 animate-fade-in-up">
      {/* Total Balance Card */}
      <StatCard
        title="Total Balance"
        mainValue={financialHealth.totalWalletBalance}
        valuePrefix="₦"
        secondaryLabel="Collected this month"
        secondaryValue={`₦${formatCurrency(financialHealth.monthlyRevenue)}`}
        percentageChange={collectionChange}
        icon={Wallet}
        iconColor="text-[#0EA5E9]"
        iconBgColor="bg-[#0EA5E9]/10"
      />

      {/* Unpaid Invoices Card */}
      <StatCard
        title="Unpaid Invoices"
        mainValue={unpaidCount}
        secondaryLabel="Total outstanding"
        secondaryValue={`₦${formatCurrency(financialHealth.totalOutstanding)}`}
        icon={FileText}
        iconColor="text-amber-600 dark:text-amber-400"
        iconBgColor="bg-amber-100 dark:bg-amber-900/20"
      />

      {/* Security Contacts Card */}
      <StatCard
        title="Security Contacts"
        mainValue={quickStats.totalSecurityContacts}
        secondaryLabel="Active this week"
        secondaryValue={quickStats.activeSecurityContacts}
        icon={Shield}
        iconColor="text-[#14B8A6]"
        iconBgColor="bg-[#14B8A6]/10"
      />
    </div>
  );
}
