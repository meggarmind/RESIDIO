'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useHousePaymentStatus } from '@/hooks/use-billing';
import { formatCurrency } from '@/lib/utils';
import {
  Receipt,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HousePaymentStatusProps {
  houseId: string;
  className?: string;
}

export function HousePaymentStatus({ houseId, className }: HousePaymentStatusProps) {
  const [isResidentsOpen, setIsResidentsOpen] = useState(false);
  const { data: status, isLoading, error } = useHousePaymentStatus(houseId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment Status
          </CardTitle>
          <CardDescription>Aggregate billing summary for this property</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load payment status</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status || status.invoiceCount === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment Status
          </CardTitle>
          <CardDescription>Aggregate billing summary for this property</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">No invoices generated for this property yet</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href={`/billing?house_id=${houseId}`}>
                View Billing
                <ExternalLink className="h-3 w-3 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasOutstanding = status.totalOutstanding > 0;
  const hasOverdue = status.overdueCount > 0;
  const collectionRate = status.totalDue > 0
    ? Math.round((status.totalPaid / status.totalDue) * 100)
    : 100;

  return (
    <Card className={cn(
      className,
      hasOverdue && 'border-l-4 border-l-destructive'
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Status
            </CardTitle>
            <CardDescription>
              Aggregate billing summary across all residents
            </CardDescription>
          </div>
          {hasOverdue && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {status.overdueCount} Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Totals Grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Total Due */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Total Due</p>
            </div>
            <p className="text-lg font-semibold">
              {formatCurrency(status.totalDue)}
            </p>
          </div>

          {/* Total Paid */}
          <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <p className="text-xs font-medium text-green-600 dark:text-green-400">Total Paid</p>
            </div>
            <p className="text-lg font-semibold text-green-700 dark:text-green-300">
              {formatCurrency(status.totalPaid)}
            </p>
          </div>

          {/* Outstanding Balance */}
          <div className={cn(
            'border rounded-lg p-4',
            hasOutstanding
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
              : 'bg-green-50 dark:bg-green-950/20'
          )}>
            <div className="flex items-center gap-2 mb-2">
              {hasOutstanding ? (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              )}
              <p className={cn(
                'text-xs font-medium',
                hasOutstanding
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              )}>
                Outstanding
              </p>
            </div>
            <p className={cn(
              'text-lg font-semibold',
              hasOutstanding
                ? 'text-red-700 dark:text-red-300'
                : 'text-green-700 dark:text-green-300'
            )}>
              {formatCurrency(status.totalOutstanding)}
            </p>
          </div>
        </div>

        {/* Collection Rate Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Collection Rate</span>
            <span className={cn(
              'font-medium',
              collectionRate >= 90 ? 'text-green-600 dark:text-green-400' :
              collectionRate >= 70 ? 'text-amber-600 dark:text-amber-400' :
              'text-red-600 dark:text-red-400'
            )}>
              {collectionRate}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-500',
                collectionRate >= 90 ? 'bg-green-500' :
                collectionRate >= 70 ? 'bg-amber-500' :
                'bg-red-500'
              )}
              style={{ width: `${collectionRate}%` }}
            />
          </div>
        </div>

        {/* Invoice Status Breakdown */}
        <div className="flex flex-wrap gap-2">
          {status.paidCount > 0 && (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {status.paidCount} Paid
            </Badge>
          )}
          {status.partiallyPaidCount > 0 && (
            <Badge variant="warning" className="gap-1">
              <Clock className="h-3 w-3" />
              {status.partiallyPaidCount} Partial
            </Badge>
          )}
          {status.unpaidCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {status.unpaidCount} Unpaid
            </Badge>
          )}
          {status.overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {status.overdueCount} Overdue
            </Badge>
          )}
        </div>

        {/* Overdue Alert */}
        {hasOverdue && (
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Overdue Amount: {formatCurrency(status.overdueAmount)}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {status.overdueCount} invoice{status.overdueCount > 1 ? 's' : ''} past due date
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* Per-Resident Breakdown (Collapsible) */}
        {status.residents.length > 0 && (
          <Collapsible open={isResidentsOpen} onOpenChange={setIsResidentsOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Breakdown by Resident ({status.residents.length})</span>
                </div>
                <ChevronDown className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  isResidentsOpen && 'rotate-180'
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-3">
              {status.residents.map((resident) => (
                <div
                  key={resident.residentId}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors',
                    resident.outstanding > 0
                      ? 'bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/50'
                      : 'bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                      resident.outstanding > 0
                        ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      {resident.residentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <Link
                        href={`/residents/${resident.residentId}`}
                        className="font-medium text-sm hover:underline hover:text-primary transition-colors"
                      >
                        {resident.residentName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {resident.invoiceCount} invoice{resident.invoiceCount > 1 ? 's' : ''}
                        {' · '}
                        Code: {resident.residentCode}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {resident.outstanding > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                          {formatCurrency(resident.outstanding)}
                        </p>
                        <p className="text-xs text-muted-foreground">outstanding</p>
                      </>
                    ) : (
                      <Badge variant="success" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Paid
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* View All Invoices Link */}
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={`/billing?house_id=${houseId}`}>
            View All Invoices
            <ExternalLink className="h-3 w-3 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
