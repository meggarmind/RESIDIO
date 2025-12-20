'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Tag,
  PieChart,
} from 'lucide-react';
import { useImportBreakdown } from '@/hooks/use-imports';
import { cn } from '@/lib/utils';
import type { TransactionTagColor } from '@/types/database';

// Color classes for transaction tags
const tagColorClasses: Record<TransactionTagColor, { bg: string; text: string }> = {
  gray: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-200' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
  green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  red: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-800 dark:text-purple-200' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200' },
};

// CSS-based pie chart visualization (simple bar-based approach)
const chartColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-red-500',
  'bg-teal-500',
  'bg-pink-500',
];

interface ImportBreakdownProps {
  importId: string;
}

function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export function ImportBreakdown({ importId }: ImportBreakdownProps) {
  const [activeView, setActiveView] = useState<'credits' | 'debits'>('credits');
  const { data: breakdown, isLoading, error } = useImportBreakdown(importId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !breakdown) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load breakdown data
      </div>
    );
  }

  const activeData = activeView === 'credits' ? breakdown.credits : breakdown.debits;
  const untaggedData = activeView === 'credits'
    ? breakdown.untagged.credits
    : breakdown.untagged.debits;

  // Calculate percentages for the horizontal bar chart
  const totalForChart = activeData.total;
  const tagPercentages = activeData.byTag.map((tag, index) => ({
    ...tag,
    percentage: totalForChart > 0 ? (tag.total / totalForChart) * 100 : 0,
    colorClass: chartColors[index % chartColors.length],
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {breakdown.credits.count + breakdown.debits.count}
            </div>
            <p className="text-xs text-muted-foreground">transactions</p>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
              Credits (In)
            </CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(breakdown.credits.total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {breakdown.credits.count} transactions
            </p>
          </CardContent>
        </Card>

        {/* Debits */}
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
              Debits (Out)
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-700 dark:text-red-400">
              {formatCurrency(breakdown.debits.total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {breakdown.debits.count} transactions
            </p>
          </CardContent>
        </Card>

        {/* Net Flow */}
        <Card className={cn(
          breakdown.netFlow >= 0
            ? 'border-green-200 dark:border-green-800'
            : 'border-red-200 dark:border-red-800'
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Flow</CardTitle>
            {breakdown.netFlow > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : breakdown.netFlow < 0 ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-xl font-bold',
              breakdown.netFlow >= 0
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-700 dark:text-red-400'
            )}>
              {breakdown.netFlow >= 0 ? '+' : ''}{formatCurrency(breakdown.netFlow)}
            </div>
            <p className="text-xs text-muted-foreground">
              {breakdown.netFlow >= 0 ? 'surplus' : 'deficit'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tag Breakdown Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Breakdown by Category
            </CardTitle>
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'credits' | 'debits')}>
              <TabsList>
                <TabsTrigger value="credits" className="gap-1">
                  <ArrowDownLeft className="h-3 w-3" />
                  Credits
                </TabsTrigger>
                <TabsTrigger value="debits" className="gap-1">
                  <ArrowUpRight className="h-3 w-3" />
                  Debits
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeData.byTag.length === 0 && untaggedData.count === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No {activeView} in this import
            </p>
          ) : (
            <div className="space-y-6">
              {/* Horizontal Bar Chart */}
              {totalForChart > 0 && (
                <div className="space-y-2">
                  <div className="h-8 w-full flex rounded-lg overflow-hidden">
                    {tagPercentages.map((tag, index) => (
                      <div
                        key={tag.tag_id || 'untagged'}
                        className={cn(tag.colorClass, 'h-full transition-all')}
                        style={{ width: `${tag.percentage}%` }}
                        title={`${tag.tag_name}: ${formatCurrency(tag.total)} (${tag.percentage.toFixed(1)}%)`}
                      />
                    ))}
                    {untaggedData.total > 0 && (
                      <div
                        className="bg-gray-300 dark:bg-gray-600 h-full"
                        style={{ width: `${(untaggedData.total / totalForChart) * 100}%` }}
                        title={`Untagged: ${formatCurrency(untaggedData.total)}`}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tagPercentages.map((tag, index) => (
                      <div key={tag.tag_id || index} className="flex items-center gap-1 text-xs">
                        <span className={cn('w-3 h-3 rounded-sm', tag.colorClass)} />
                        <span>{tag.tag_name}</span>
                      </div>
                    ))}
                    {untaggedData.total > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                        <span>Untagged</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tag Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeData.byTag.map((tag) => {
                  const colorInfo = tagColorClasses[tag.tag_color as TransactionTagColor] || tagColorClasses.gray;
                  return (
                    <div
                      key={tag.tag_id}
                      className={cn(
                        'p-4 rounded-lg border',
                        colorInfo.bg
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge
                          variant="secondary"
                          className={cn(colorInfo.bg, colorInfo.text, 'font-medium')}
                        >
                          {tag.tag_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {tag.count} txn{tag.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className={cn('text-lg font-bold', colorInfo.text)}>
                        {formatCurrency(tag.total)}
                      </p>
                      {totalForChart > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {((tag.total / totalForChart) * 100).toFixed(1)}% of total
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* Untagged Card */}
                {untaggedData.count > 0 && (
                  <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="font-medium">
                        Untagged
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {untaggedData.count} txn{untaggedData.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                      {formatCurrency(untaggedData.total)}
                    </p>
                    {totalForChart > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {((untaggedData.total / totalForChart) * 100).toFixed(1)}% of total
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
