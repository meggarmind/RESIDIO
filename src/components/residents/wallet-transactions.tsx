'use client';

import { useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useYearlyWalletTransactions } from '@/hooks/use-wallet';
import type { YearlyWalletTransactionSummary } from '@/actions/billing/wallet';
import { getInvoiceById } from '@/actions/billing/get-invoices';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowUpCircle, ArrowDownCircle, Receipt, FileText, ExternalLink, Loader2, ChevronDown, CalendarDays } from 'lucide-react';

interface WalletTransactionsProps {
  residentId: string;
  limit?: number;
}

type TransactionRow = {
  id: string;
  type: string;
  created_at: string;
  amount: number;
  balance_after: number;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

const WalletTransactionRow = memo(function WalletTransactionRow({
  transaction,
}: {
  transaction: TransactionRow;
}) {
  const isCredit = transaction.type === 'credit';
  const amountColor = isCredit
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const icon = isCredit ? (
    <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
  ) : (
    <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
  );

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="text-sm">
        {format(new Date(transaction.created_at), 'MMM d, yyyy')}
        <br />
        <span className="text-xs text-muted-foreground">
          {format(new Date(transaction.created_at), 'h:mm a')}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {icon}
          <span className="capitalize">{transaction.type}</span>
        </div>
      </TableCell>
      <TableCell className={`text-right font-semibold ${amountColor}`}>
        {isCredit ? '+' : '-'}
        {formatCurrency(Number(transaction.amount))}
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(Number(transaction.balance_after))}
      </TableCell>
      <TableCell>
        <div className="space-y-1 text-sm">
          <p>{transaction.description || '-'}</p>
          {transaction.reference_type && transaction.reference_id && (
            <ReferenceLink type={transaction.reference_type} id={transaction.reference_id} />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

type FilteredYearlySummary = YearlyWalletTransactionSummary & {
  totalCredits: number;
  totalDebits: number;
  netChange: number;
};

function YearlyWalletTransactionRow({ summary }: { summary: FilteredYearlySummary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(!open)}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            {summary.year}
          </div>
        </TableCell>
        <TableCell className="text-right font-medium text-emerald-600 dark:text-emerald-400">
          {formatCurrency(summary.totalCredits)}
        </TableCell>
        <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
          {formatCurrency(summary.totalDebits)}
        </TableCell>
        <TableCell className={`text-right font-medium ${summary.netChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {summary.netChange >= 0 ? '+' : '-'}{formatCurrency(Math.abs(summary.netChange))}
        </TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(summary.closing_balance)}</TableCell>
      </TableRow>
      {open && (
        <>
          <TableRow className="border-b-0">
            <TableCell colSpan={5} className="py-1 pl-8">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                Transactions ({summary.transactions.length})
              </div>
            </TableCell>
          </TableRow>
          <TableRow className="border-b bg-muted/20">
            <TableCell className="py-1 pl-8 text-xs font-medium text-muted-foreground">Date</TableCell>
            <TableCell className="py-1 text-xs font-medium text-muted-foreground">Type</TableCell>
            <TableCell className="py-1 text-right text-xs font-medium text-muted-foreground">Amount</TableCell>
            <TableCell className="py-1 text-right text-xs font-medium text-muted-foreground">Balance</TableCell>
            <TableCell className="py-1 text-xs font-medium text-muted-foreground">Details</TableCell>
          </TableRow>
          {summary.transactions.map((transaction) => (
            <WalletTransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </>
      )}
    </>
  );
}

export function WalletTransactions({ residentId }: WalletTransactionsProps) {
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const { data, isLoading } = useYearlyWalletTransactions(residentId);
  const yearlyTransactions = (data || []).map((summary) => {
    const transactions = filter === 'all'
      ? summary.transactions
      : summary.transactions.filter((transaction) => transaction.type === filter);
    const totalCredits = transactions
      .filter((transaction) => transaction.type === 'credit')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    const totalDebits = transactions
      .filter((transaction) => transaction.type === 'debit')
      .reduce((total, transaction) => total + Number(transaction.amount), 0);

    return {
      ...summary,
      transactions,
      totalCredits,
      totalDebits,
      netChange: totalCredits - totalDebits,
    };
  }).filter((summary) => summary.transactions.length > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Wallet credits and debits</CardDescription>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'credit' | 'debit')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="credit">Credits Only</SelectItem>
              <SelectItem value="debit">Debits Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : yearlyTransactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Year</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Net Change</TableHead>
                  <TableHead className="text-right">Closing Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearlyTransactions.map((summary) => (
                  <YearlyWalletTransactionRow key={summary.year} summary={summary} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper component to render reference links
function ReferenceLink({ type, id }: { type: string; id: string }) {
  if (type === 'payment') {
    return (
      <Link href={`/payments/${id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
        <Receipt className="h-3 w-3" />
        Payment
      </Link>
    );
  }

  if (type === 'invoice') {
    return <InvoiceReferencePopover invoiceId={id} />;
  }

  return <span className="text-xs text-muted-foreground capitalize">{type}</span>;
}

function InvoiceReferencePopover({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-reference', invoiceId],
    queryFn: async () => {
      const result = await getInvoiceById(invoiceId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto gap-1 px-1 py-0 text-xs text-primary hover:text-primary">
          <FileText className="h-3 w-3" />
          Invoice
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invoice...
          </div>
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Invoice</p>
                <p className="font-mono text-sm font-semibold">{data.invoice_number}</p>
              </div>
              <Badge variant={data.status === 'paid' ? 'default' : 'secondary'} className="capitalize">
                {data.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="space-y-1 border-y py-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Amount due</span>
                <span className="font-medium">{formatCurrency(Number(data.amount_due))}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-medium">{formatCurrency(Math.max(0, Number(data.amount_due) - Number(data.amount_paid)))}</span>
              </div>
              {data.due_date && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Due date</span>
                  <span>{format(new Date(data.due_date), 'MMM d, yyyy')}</span>
                </div>
              )}
            </div>
            <Button size="sm" className="w-full" asChild>
              <Link href={`/billing/${invoiceId}`}>
                Go to invoice
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">Invoice unavailable.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
