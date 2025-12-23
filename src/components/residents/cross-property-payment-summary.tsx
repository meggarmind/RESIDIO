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
import { useResidentCrossPropertyPaymentSummary } from '@/hooks/use-billing';
import { formatCurrency } from '@/lib/utils';
import {
  Receipt,
  ChevronDown,
  Home,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrossPropertyPaymentSummaryProps {
  residentId: string;
  className?: string;
}

export function CrossPropertyPaymentSummary({ residentId, className }: CrossPropertyPaymentSummaryProps) {
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const { data: summary, isLoading, error } = useResidentCrossPropertyPaymentSummary(residentId);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Outstanding Balance
          </CardTitle>
          <CardDescription>Payment summary across all properties</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
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
            Outstanding Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load payment summary</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.totalInvoices === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Outstanding Balance
          </CardTitle>
          <CardDescription>Payment summary across all properties</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">No invoices found for this resident</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasOutstanding = summary.totalOutstanding > 0;
  const hasOverdueProperties = summary.properties.some(p => p.overdueCount > 0);
  const collectionRate = summary.totalDue > 0
    ? Math.round((summary.totalPaid / summary.totalDue) * 100)
    : 100;

  return (
    <Card className={cn(
      className,
      hasOverdueProperties && 'border-l-4 border-l-destructive'
    )}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Outstanding Balance
            </CardTitle>
            <CardDescription>
              Payment summary across {summary.properties.length} propert{summary.properties.length === 1 ? 'y' : 'ies'}
            </CardDescription>
          </div>
          {hasOverdueProperties && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Outstanding (Hero) */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">Total Outstanding</p>
          <p className={cn(
            'text-4xl font-bold',
            hasOutstanding ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
          )}>
            {formatCurrency(summary.totalOutstanding)}
          </p>
          {hasOutstanding && (
            <p className="text-xs text-muted-foreground mt-1">
              from {summary.totalInvoices} invoice{summary.totalInvoices > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Total Due */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">Total Due</p>
            <p className="text-lg font-semibold">{formatCurrency(summary.totalDue)}</p>
          </div>

          {/* Total Paid */}
          <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
              <p className="text-xs font-medium text-green-600 dark:text-green-400">Total Paid</p>
            </div>
            <p className="text-lg font-semibold text-green-700 dark:text-green-300">
              {formatCurrency(summary.totalPaid)}
            </p>
          </div>
        </div>

        {/* Collection Rate */}
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

        <Separator />

        {/* Per-Property Breakdown (Collapsible) */}
        {summary.properties.length > 0 && (
          <Collapsible open={isPropertiesOpen} onOpenChange={setIsPropertiesOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  <span>Breakdown by Property ({summary.properties.length})</span>
                </div>
                <ChevronDown className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  isPropertiesOpen && 'rotate-180'
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-3">
              {summary.properties.map((property) => (
                <div
                  key={property.houseId}
                  className={cn(
                    'relative p-3 rounded-lg border transition-colors',
                    property.outstanding > 0
                      ? 'bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/50'
                      : 'bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  {/* Current property indicator */}
                  {property.isCurrentProperty && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="text-xs bg-background">
                        <MapPin className="h-3 w-3 mr-1" />
                        Current
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                        property.outstanding > 0
                          ? 'bg-red-100 dark:bg-red-900/50'
                          : 'bg-muted'
                      )}>
                        <Home className={cn(
                          'h-5 w-5',
                          property.outstanding > 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                        )} />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/houses/${property.houseId}`}
                          className="font-medium text-sm hover:underline hover:text-primary transition-colors block truncate"
                        >
                          {property.houseNumber} {property.streetName}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {property.invoiceCount} invoice{property.invoiceCount > 1 ? 's' : ''}
                          </span>
                          {property.overdueCount > 0 && (
                            <Badge variant="destructive" className="text-xs py-0 px-1.5">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                              {property.overdueCount} overdue
                            </Badge>
                          )}
                          {property.unpaidCount > 0 && property.overdueCount === 0 && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              {property.unpaidCount} unpaid
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {property.outstanding > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(property.outstanding)}
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
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* View All Invoices Link */}
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={`/billing?resident_id=${residentId}`}>
            View All Invoices
            <ExternalLink className="h-3 w-3 ml-2" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
