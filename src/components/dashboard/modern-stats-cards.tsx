'use client';

import { Wallet, FileText, Shield, TrendingUp, TrendingDown, Info, ChevronRight, Hash, Users } from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import type { FinancialHealthMetrics, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import Link from 'next/link';

interface ModernStatsCardsProps {
  financialHealth: FinancialHealthMetrics | null;
  quickStats: QuickStats | null;
  unpaidCount: number;
  isLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Shared Utilities
// ─────────────────────────────────────────────────────────────────

const formatValue = (value: number) => {
  return new Intl.NumberFormat('en-NG').format(Math.round(value));
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

// ─────────────────────────────────────────────────────────────────
// specialized Stat Components
// ─────────────────────────────────────────────────────────────────

function HealthStat({ title, percentage, label }: { title: string; percentage: number; label: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm animate-fade-in-up h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <div className="relative flex items-center justify-center">
          <svg className="h-20 w-20 transform -rotate-90">
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-muted/30"
            />
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="text-primary transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">
              <AnimatedCounter value={percentage} duration={1000} />%
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center px-2">{label}</p>
      </div>
    </div>
  );
}

function ActionStat({ title, count, label, secondaryLabel, href }: { title: string; count: number; label: string; secondaryLabel: string; href: string }) {
  return (
    <Link href={href} className="group h-full">
      <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group-hover:border-primary/30 h-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-2">
          <span className="text-4xl font-bold mb-1">
            <AnimatedCounter value={count} duration={800} />
          </span>
          <span className="text-[11px] font-medium text-foreground/80 mb-2">{label}</span>
          <p className="text-[10px] text-muted-foreground text-center border-t border-muted/50 pt-2 w-full">
            {secondaryLabel}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CurrencyStat({ title, value, label, subLabel }: { title: string; value: number; label: string; subLabel: string }) {
  return (
    <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm animate-fade-in-up h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <div className="text-2xl font-bold flex items-baseline gap-1 mb-2">
          <span className="text-lg text-muted-foreground">₦</span>
          <span>{formatValue(value)}</span>
        </div>
        <div className="bg-muted px-2 py-0.5 rounded-full mb-3">
          <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center uppercase tracking-tighter">
          {subLabel}
        </p>
      </div>
    </div>
  );
}

function HighlightStat({ title, value, label, details }: { title: string; value: number; label: string; details: string }) {
  return (
    <div className="flex flex-col bg-primary/5 rounded-xl border border-primary/20 p-4 shadow-sm animate-fade-in-up h-full relative overflow-hidden group">
      {/* Texture background */}
      <div className="absolute top-0 right-0 p-1 opacity-10 transition-transform group-hover:scale-110">
        <TrendingUp className="h-12 w-12 text-primary rotate-12" />
      </div>

      <div className="flex items-center gap-1.5 mb-2 relative z-10 transition-colors">
        <div className="p-1 rounded bg-primary/20">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-xs font-bold text-primary uppercase tracking-wider">{title}</span>
        <Info className="h-3.5 w-3.5 text-primary/40 ml-auto" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2 relative z-10">
        <div className="text-3xl font-bold text-primary mb-1">
          ₦{formatValue(value)}
        </div>
        <span className="text-[11px] font-medium text-primary/80 mb-3">{label}</span>
        <p className="text-[10px] text-primary/60 text-center uppercase font-bold tracking-tight">
          {details}
        </p>
      </div>
    </div>
  );
}

function OccupancyStat({ title, current, total, label, subLabel }: { title: string; current: number; total: number; label: string; subLabel: string }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm animate-fade-in-up h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <IconContainer icon={Users} color="text-foreground" bgColor="bg-muted" />

        <div className="w-full text-center mb-1">
          <span className="text-xl font-bold">{label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground mb-4 uppercase font-medium">
          ₦{formatValue(current)} ({formatValue(percentage)}%)
        </div>

        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-foreground transition-all duration-1000 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function IconContainer({ icon: Icon, color, bgColor }: { icon: any, color: string, bgColor: string }) {
  return (
    <div className={cn("p-1.5 rounded-lg mb-3", bgColor)}>
      <Icon className={cn("h-4 w-4", color)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────

function StatsCardsSkeleton() {
  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155] min-h-[160px]"
        >
          <ShimmerSkeleton width={80} height={12} className="mb-4" speed="fast" />
          <div className="flex flex-col items-center justify-center space-y-4 pt-2">
            <ShimmerSkeleton width={60} height={60} rounded="full" speed="fast" />
            <ShimmerSkeleton width={100} height={20} speed="fast" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

export function ModernStatsCards({
  financialHealth,
  quickStats,
  unpaidCount,
  isLoading,
}: ModernStatsCardsProps) {
  if (isLoading || !financialHealth || !quickStats) {
    return <StatsCardsSkeleton />;
  }

  const collectionRate = Math.round(financialHealth.collectionRate);
  const pendingActions = (unpaidCount ?? 0) + (quickStats.pendingVerification ?? 0);

  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 animate-fade-in-up">
      {/* 1. Collection Health (Circular Progress) */}
      <HealthStat
        title="Collection"
        percentage={collectionRate}
        label={`${formatValue(financialHealth.totalCollected)} of ${formatValue(financialHealth.totalCollected + financialHealth.totalOutstanding)} Invoices`}
      />

      {/* 2. Action Needed (Large Number) */}
      <ActionStat
        title="Action Needed"
        count={pendingActions}
        label="items need attention"
        secondaryLabel={`${unpaidCount} unpaid • ${quickStats.pendingVerification} pending verification`}
        href="/approvals"
      />

      {/* 3. Wallet Balance (Portfolio Stats) */}
      <CurrencyStat
        title="Portfolio Value"
        value={financialHealth.totalWalletBalance}
        label="Total Wallet Balance"
        subLabel="vs last month"
      />

      {/* 4. Monthly Revenue (Primary Highlight Card) */}
      <HighlightStat
        title="Monthly Revenue"
        value={financialHealth.monthlyRevenue}
        label="collected this month"
        details="Payment Analysis"
      />

      {/* 5. Occupancy (Horizontal Progress) */}
      <OccupancyStat
        title="Occupancy"
        current={quickStats.occupiedHouses}
        total={quickStats.totalHouses}
        label="Occupied Houses"
        subLabel="Occupancy Rate"
      />
    </div>
  );
}
