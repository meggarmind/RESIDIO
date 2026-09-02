'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getHouseYearlySummary } from '@/actions/houses/get-house-yearly-summary';
import { formatCurrency } from '@/lib/utils';
import { CalendarDays, CheckCircle2, Clock, AlertCircle, ChevronDown, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { YearlyPaymentSummary } from '@/actions/houses/get-house-yearly-summary';

interface YearlyPaymentTableProps {
  houseId: string;
}

function PaymentRow({ payment }: { payment: YearlyPaymentSummary['payments'][0] }) {
  return (
    <TableRow className="bg-muted/30">
      <TableCell className="pl-10 text-xs text-muted-foreground">{payment.month_label}</TableCell>
      <TableCell></TableCell>
      <TableCell className="text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
        {formatCurrency(payment.amount)}
      </TableCell>
      <TableCell></TableCell>
      <TableCell className="text-center text-xs text-muted-foreground">{payment.day_label}</TableCell>
    </TableRow>
  );
}

function YearRow({ row }: { row: YearlyPaymentSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50 group" onClick={() => setOpen(!open)}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            {row.year}
          </div>
        </TableCell>
        <TableCell className="text-right">{formatCurrency(row.amount_due)}</TableCell>
        <TableCell className="text-right text-green-600 dark:text-green-400">
          {formatCurrency(row.amount_paid)}
        </TableCell>
        <TableCell className={cn('text-right', row.outstanding > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400')}>
          {formatCurrency(row.outstanding)}
        </TableCell>
        <TableCell className="text-center">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            row.outstanding === 0 && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
            row.amount_paid > 0 && row.outstanding > 0 && 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
            row.amount_paid === 0 && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          )}>
            {row.outstanding === 0 && row.payments.length > 0 && (
              <><CheckCircle2 className="h-2.5 w-2.5" /> Fully Paid ({row.payments.length})</>
            )}
            {row.outstanding === 0 && row.payments.length === 0 && (
              <><CheckCircle2 className="h-2.5 w-2.5" /> Fully Paid</>
            )}
            {row.amount_paid > 0 && row.outstanding > 0 && (
              <><Clock className="h-2.5 w-2.5" /> Partially Paid ({row.payments.length})</>
            )}
            {row.amount_paid === 0 && (
              <><AlertCircle className="h-2.5 w-2.5" /> Not Paid</>
            )}
          </span>
        </TableCell>
      </TableRow>
      {open && (
        <>
          {row.payments.length > 0 && (
            <>
              <TableRow className="border-b-0">
                <TableCell colSpan={5} className="py-1 pl-8">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Banknote className="h-3 w-3" />
                    Monthly Payments ({row.payments.length})
                  </div>
                </TableCell>
              </TableRow>
              <TableRow className="border-b bg-muted/20">
                <TableCell className="pl-10 py-1 text-xs text-muted-foreground font-medium">Month</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right py-1 text-xs text-muted-foreground font-medium">Amount</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-center py-1 text-xs text-muted-foreground font-medium">Day</TableCell>
              </TableRow>
              {row.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </>
          )}
          {row.payments.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-2 pl-10 text-xs text-muted-foreground">
                No individual payment records
              </TableCell>
            </TableRow>
          )}
        </>
      )}
    </>
  );
}

export function YearlyPaymentTable({ houseId }: YearlyPaymentTableProps) {
  return <YearlyPaymentTableContent key={houseId} houseId={houseId} />;
}

function YearlyPaymentTableContent({ houseId }: YearlyPaymentTableProps) {
  const [data, setData] = useState<YearlyPaymentSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHouseYearlySummary(houseId).then((result) => {
      setData(result.data);
      setLoading(false);
    });
  }, [houseId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Yearly Payment Summary
          </CardTitle>
          <CardDescription>Total due and paid per calendar year — click a year to see monthly detail</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Yearly Payment Summary
          </CardTitle>
          <CardDescription>Total due and paid per calendar year — click a year to see monthly detail</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            No invoice data available for this house
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Yearly Payment Summary
        </CardTitle>
        <CardDescription>
          Total due and paid per calendar year — click a year to see monthly detail
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Year</TableHead>
              <TableHead className="text-right">Amount Due</TableHead>
              <TableHead className="text-right">Amount Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <YearRow key={row.year} row={row} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
