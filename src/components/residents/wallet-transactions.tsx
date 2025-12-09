'use client';

import { useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWalletTransactions } from '@/hooks/use-wallet';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowUpCircle, ArrowDownCircle, Receipt, FileText } from 'lucide-react';

interface WalletTransactionsProps {
  residentId: string;
  limit?: number;
}

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
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
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
                {filteredTransactions.map((transaction) => {
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
                    <TableRow key={transaction.id}>
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
                })}
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
    return (
      <Link href={`/billing/invoices/${id}`} className="text-xs text-primary hover:underline flex items-center gap-1">
        <FileText className="h-3 w-3" />
        Invoice
      </Link>
    );
  }

  return <span className="text-xs text-muted-foreground capitalize">{type}</span>;
}
