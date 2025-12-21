'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Tag,
  PieChart,
  Download,
  Calculator,
} from 'lucide-react';
import { useImportBreakdown } from '@/hooks/use-imports';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
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
  onTagFilter?: (tagId: string | null, transactionType: 'credit' | 'debit') => void;
}

function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export function ImportBreakdown({ importId, onTagFilter }: ImportBreakdownProps) {
  const [activeView, setActiveView] = useState<'credits' | 'debits'>('credits');
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const { data: breakdown, isLoading, error } = useImportBreakdown(importId);

  // Calculate additional metrics
  const metrics = useMemo(() => {
    if (!breakdown) return null;

    const creditsAvg = breakdown.credits.count > 0
      ? breakdown.credits.total / breakdown.credits.count
      : 0;
    const debitsAvg = breakdown.debits.count > 0
      ? breakdown.debits.total / breakdown.debits.count
      : 0;

    // Find highest and lowest transactions by tag
    const allCreditTags = breakdown.credits.byTag;
    const allDebitTags = breakdown.debits.byTag;

    const highestCreditTag = allCreditTags.reduce((max, tag) =>
      tag.total > (max?.total || 0) ? tag : max, allCreditTags[0]);
    const highestDebitTag = allDebitTags.reduce((max, tag) =>
      tag.total > (max?.total || 0) ? tag : max, allDebitTags[0]);

    return {
      creditsAvg,
      debitsAvg,
      highestCreditTag,
      highestDebitTag,
    };
  }, [breakdown]);

  // Export breakdown as CSV
  const handleExportCSV = () => {
    if (!breakdown) return;

    const rows: string[] = [];
    rows.push('Type,Category,Count,Total,Percentage');

    // Credits
    breakdown.credits.byTag.forEach((tag) => {
      const pct = breakdown.credits.total > 0
        ? ((tag.total / breakdown.credits.total) * 100).toFixed(1)
        : '0.0';
      rows.push(`Credit,${tag.tag_name},${tag.count},${tag.total.toFixed(2)},${pct}%`);
    });
    if (breakdown.untagged.credits.count > 0) {
      const pct = breakdown.credits.total > 0
        ? ((breakdown.untagged.credits.total / breakdown.credits.total) * 100).toFixed(1)
        : '0.0';
      rows.push(`Credit,Untagged,${breakdown.untagged.credits.count},${breakdown.untagged.credits.total.toFixed(2)},${pct}%`);
    }

    // Debits
    breakdown.debits.byTag.forEach((tag) => {
      const pct = breakdown.debits.total > 0
        ? ((tag.total / breakdown.debits.total) * 100).toFixed(1)
        : '0.0';
      rows.push(`Debit,${tag.tag_name},${tag.count},${tag.total.toFixed(2)},${pct}%`);
    });
    if (breakdown.untagged.debits.count > 0) {
      const pct = breakdown.debits.total > 0
        ? ((breakdown.untagged.debits.total / breakdown.debits.total) * 100).toFixed(1)
        : '0.0';
      rows.push(`Debit,Untagged,${breakdown.untagged.debits.count},${breakdown.untagged.debits.total.toFixed(2)},${pct}%`);
    }

    // Summary row
    rows.push('');
    rows.push('Summary,,,');
    rows.push(`Total Credits,,${breakdown.credits.count},${breakdown.credits.total.toFixed(2)}`);
    rows.push(`Total Debits,,${breakdown.debits.count},${breakdown.debits.total.toFixed(2)}`);
    rows.push(`Net Flow,,,${breakdown.netFlow.toFixed(2)}`);

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-breakdown-${importId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Breakdown exported to CSV');
  };

  // Handle tag card click for drill-down
  const handleTagClick = (tagId: string | null) => {
    if (onTagFilter) {
      onTagFilter(tagId, activeView === 'credits' ? 'credit' : 'debit');
    }
  };

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

      {/* Additional Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Credit</CardTitle>
              <Calculator className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-green-700 dark:text-green-400">
                {formatCurrency(metrics.creditsAvg)}
              </div>
              <p className="text-xs text-muted-foreground">per transaction</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Debit</CardTitle>
              <Calculator className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-red-700 dark:text-red-400">
                {formatCurrency(metrics.debitsAvg)}
              </div>
              <p className="text-xs text-muted-foreground">per transaction</p>
            </CardContent>
          </Card>
          {metrics.highestCreditTag && (
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Top Credit Category</CardTitle>
                <ArrowDownLeft className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <Badge className="mb-1" variant="outline">
                  {metrics.highestCreditTag.tag_name}
                </Badge>
                <p className="text-sm font-bold">
                  {formatCurrency(metrics.highestCreditTag.total)}
                </p>
              </CardContent>
            </Card>
          )}
          {metrics.highestDebitTag && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Top Debit Category</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <Badge className="mb-1" variant="outline">
                  {metrics.highestDebitTag.tag_name}
                </Badge>
                <p className="text-sm font-bold">
                  {formatCurrency(metrics.highestDebitTag.total)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tag Breakdown Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Breakdown by Category
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
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
                  <div className="h-10 w-full flex rounded-lg overflow-hidden shadow-inner">
                    <TooltipProvider>
                      {tagPercentages.map((tag) => (
                        <Tooltip key={tag.tag_id || 'untagged'}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                tag.colorClass,
                                'h-full transition-all duration-300 cursor-pointer',
                                hoveredSegment === tag.tag_id
                                  ? 'opacity-100 scale-y-110'
                                  : hoveredSegment && hoveredSegment !== tag.tag_id
                                    ? 'opacity-50'
                                    : 'opacity-90 hover:opacity-100'
                              )}
                              style={{ width: `${tag.percentage}%` }}
                              onMouseEnter={() => setHoveredSegment(tag.tag_id)}
                              onMouseLeave={() => setHoveredSegment(null)}
                              onClick={() => handleTagClick(tag.tag_id)}
                            />
                          </TooltipTrigger>
                          <TooltipContent className="p-3">
                            <div className="font-medium">{tag.tag_name}</div>
                            <div className="text-lg font-bold">{formatCurrency(tag.total)}</div>
                            <div className="text-xs text-muted-foreground">
                              {tag.count} transactions · {tag.percentage.toFixed(1)}%
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {untaggedData.total > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'bg-gray-300 dark:bg-gray-600 h-full transition-all duration-300 cursor-pointer',
                                hoveredSegment === 'untagged'
                                  ? 'opacity-100 scale-y-110'
                                  : hoveredSegment && hoveredSegment !== 'untagged'
                                    ? 'opacity-50'
                                    : 'opacity-90 hover:opacity-100'
                              )}
                              style={{ width: `${(untaggedData.total / totalForChart) * 100}%` }}
                              onMouseEnter={() => setHoveredSegment('untagged')}
                              onMouseLeave={() => setHoveredSegment(null)}
                              onClick={() => handleTagClick(null)}
                            />
                          </TooltipTrigger>
                          <TooltipContent className="p-3">
                            <div className="font-medium">Untagged</div>
                            <div className="text-lg font-bold">{formatCurrency(untaggedData.total)}</div>
                            <div className="text-xs text-muted-foreground">
                              {untaggedData.count} transactions · {((untaggedData.total / totalForChart) * 100).toFixed(1)}%
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tagPercentages.map((tag) => (
                      <button
                        key={tag.tag_id}
                        className={cn(
                          'flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors',
                          hoveredSegment === tag.tag_id
                            ? 'bg-muted'
                            : 'hover:bg-muted/50'
                        )}
                        onMouseEnter={() => setHoveredSegment(tag.tag_id)}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() => handleTagClick(tag.tag_id)}
                      >
                        <span className={cn('w-3 h-3 rounded-sm', tag.colorClass)} />
                        <span>{tag.tag_name}</span>
                      </button>
                    ))}
                    {untaggedData.total > 0 && (
                      <button
                        className={cn(
                          'flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors',
                          hoveredSegment === 'untagged'
                            ? 'bg-muted'
                            : 'hover:bg-muted/50'
                        )}
                        onMouseEnter={() => setHoveredSegment('untagged')}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() => handleTagClick(null)}
                      >
                        <span className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
                        <span>Untagged</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Tag Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeData.byTag.map((tag) => {
                  const colorInfo = tagColorClasses[tag.tag_color as TransactionTagColor] || tagColorClasses.gray;
                  const avgAmount = tag.count > 0 ? tag.total / tag.count : 0;
                  return (
                    <div
                      key={tag.tag_id}
                      className={cn(
                        'p-4 rounded-lg border transition-all duration-200',
                        colorInfo.bg,
                        onTagFilter && 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
                      )}
                      onClick={() => handleTagClick(tag.tag_id)}
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
                      <div className="flex items-center justify-between mt-2">
                        {totalForChart > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {((tag.total / totalForChart) * 100).toFixed(1)}% of total
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          avg: {formatCurrency(avgAmount)}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Untagged Card */}
                {untaggedData.count > 0 && (
                  <div
                    className={cn(
                      'p-4 rounded-lg border bg-gray-50 dark:bg-gray-800 transition-all duration-200',
                      onTagFilter && 'cursor-pointer hover:shadow-md hover:scale-[1.02]'
                    )}
                    onClick={() => handleTagClick(null)}
                  >
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
                    <div className="flex items-center justify-between mt-2">
                      {totalForChart > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {((untaggedData.total / totalForChart) * 100).toFixed(1)}% of total
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        avg: {formatCurrency(untaggedData.count > 0 ? untaggedData.total / untaggedData.count : 0)}
                      </p>
                    </div>
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
