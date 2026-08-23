'use client';

import { TrendingUp, Info, Sparkles, ArrowRight, Zap } from 'lucide-react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DashboardActionMetrics, FinancialHealthMetrics, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import type { SmartSuggestion } from '@/hooks/use-smart-suggestions';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModernStatsCardsProps {
  financialHealth: FinancialHealthMetrics | null;
  quickStats: QuickStats | null;
  actionMetrics?: DashboardActionMetrics | null;
  suggestions?: SmartSuggestion[];
  isLoading?: boolean;
  isUnavailable?: boolean;
  areActionMetricsUnavailable?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Shared Utilities
// ─────────────────────────────────────────────────────────────────

const formatValue = (value: number) => {
  return new Intl.NumberFormat('en-NG').format(Math.round(value));
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

function ActionStat({ title, count, label, secondaryLabel }: { title: string; count: number; label: string; secondaryLabel: string }) {
  return (
    <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <Zap className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-2">
        <span className="mb-1 text-4xl font-bold">
          <AnimatedCounter value={count} duration={800} />
        </span>
        <span className="mb-2 text-[11px] font-medium text-foreground/80">{label}</span>
        <p className="w-full border-t border-muted/50 pt-2 text-center text-[10px] text-muted-foreground">
          {secondaryLabel}
        </p>
      </div>
    </div>
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

function SuggestionsCarousel({ suggestions }: { suggestions: SmartSuggestion[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (suggestions.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % suggestions.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [suggestions.length]);

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm h-full items-center justify-center text-muted-foreground text-center">
        <Sparkles className="h-5 w-5 mb-2 opacity-20" />
        <p className="text-xs">No suggestions at the moment</p>
      </div>
    );
  }

  const suggestion = suggestions[currentIndex];

  return (
    <div className="flex flex-col bg-card rounded-xl border p-4 shadow-sm animate-fade-in-up h-full relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggestions</span>
        </div>
        {suggestions.length > 1 && (
          <div className="flex gap-1">
            {suggestions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 w-3 rounded-full transition-all duration-300",
                  i === currentIndex ? "bg-purple-500 w-4" : "bg-muted"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={suggestion.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                suggestion.priority === 'high' ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                  suggestion.priority === 'medium' ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}>
                <Zap className="h-2.5 w-2.5" />
              </div>
              <h4 className="font-bold text-xs truncate">{suggestion.title}</h4>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mb-3">
              {suggestion.description}
            </p>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] w-full justify-between group px-2 border border-muted hover:bg-muted/50" asChild>
              <Link href={suggestion.actionUrl}>
                {suggestion.actionLabel}
                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </motion.div>
        </AnimatePresence>
      </div>
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
  actionMetrics,
  suggestions = [],
  isLoading,
  isUnavailable = false,
  areActionMetricsUnavailable = false,
}: ModernStatsCardsProps) {
  if (isLoading) {
    return <StatsCardsSkeleton />;
  }

  if (isUnavailable || !financialHealth || !quickStats) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center" role="status">
        <p className="text-sm font-semibold">Dashboard metrics unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">Financial and estate statistics could not be loaded.</p>
      </div>
    );
  }

  const collectionRate = Math.round(financialHealth.collectionRate);
  const pendingActions = actionMetrics?.totalRequiringAttention ?? 0;
  const actionDetails = areActionMetricsUnavailable
    ? 'Attention status unavailable'
    : actionMetrics
      ? `${actionMetrics.unverifiedPayments} unverified payments • ${actionMetrics.pendingResidentVerifications} resident verifications • ${actionMetrics.expiringSecurityContacts} expiring contacts`
      : '0 items need attention';

  return (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 animate-fade-in-up">
      {/* 1. Collection Health (Circular Progress) */}
      <HealthStat
        title="Collection"
        percentage={collectionRate}
        label={`₦${formatValue(financialHealth.totalCollected)} collected of ₦${formatValue(financialHealth.totalCollected + financialHealth.totalOutstanding)} invoiced`}
      />

      {/* 2. Action Needed (Large Number) */}
      <ActionStat
        title="Action Needed"
        count={pendingActions}
        label="items need attention"
        secondaryLabel={actionDetails}
      />

      <CurrencyStat
        title="Estate Cash"
        value={financialHealth.estateCash}
        label="Imported bank net cash + petty cash"
        subLabel="Excludes resident wallet credits"
      />

      <HighlightStat
        title="Verified Payments"
        value={financialHealth.monthlyRevenue}
        label="received this month"
        details={`₦${formatValue(financialHealth.totalMonthlyRevenue)} all paid records`}
      />

      {/* 5. Suggestions Carousel (Replaced Occupancy) */}
      <SuggestionsCarousel suggestions={suggestions} />
    </div>
  );
}
