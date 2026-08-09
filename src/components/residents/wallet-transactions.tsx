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
import { useWalletTransactions } from '@/hooks/use-wallet';
import { getInvoiceById } from '@/actions/billing/get-invoices';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowUpCircle, ArrowDownCircle, Receipt, FileText, ExternalLink, Loader2 } from 'lucide-react';

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
    <TableRow>
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
      <TableCell className="text-sm">{transaction.description || '-'}</TableCell>
      <TableCell>
        {transaction.reference_type && transaction.reference_id ? (
          <ReferenceLink
            type={transaction.reference_type}
            id={transaction.reference_id}
          />
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
});

export function WalletTransactions({ residentId, limit = 50 }: WalletTransactionsProps) {
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const { data: transactionsData, isLoading } = useWalletTransactions(residentId, limit);

  const transactions = transactionsData?.data || [];

  // Filter transactions
  const filteredTransactions = transactions.filter((t) => {
    if (filter === 'all') return true;
    return t.type === filter;
  });

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
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction) => (
                  <WalletTransactionRow key={transaction.id} transaction={transaction} />
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
