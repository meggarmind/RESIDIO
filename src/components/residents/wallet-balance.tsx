'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet, useWalletTransactions } from '@/hooks/use-wallet';
import { formatCurrency } from '@/lib/utils';
import { Wallet, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { WalletAdjustmentDialog } from './wallet-adjustment-dialog';

interface WalletBalanceProps {
  residentId: string;
  showActions?: boolean;
}

export function WalletBalance({ residentId, showActions = true }: WalletBalanceProps) {
  const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
  const { data: walletData, isLoading: walletLoading } = useWallet(residentId);
  const { data: transactionsData } = useWalletTransactions(residentId, 1000);

  if (walletLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const wallet = walletData?.data;
  const balance = wallet?.balance || 0;
  const transactions = transactionsData?.data || [];

  // Calculate total credits and debits
  const totalCredits = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalDebits = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balanceColor = balance > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wallet className="h-4 w-4" />
                Wallet Balance
              </CardTitle>
              <CardDescription className="text-xs">Resident payment wallet</CardDescription>
            </div>
            {showActions && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIsAdjustmentDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adjust
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Balance */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
            <p className={`text-2xl font-bold ${balanceColor}`}>{formatCurrency(balance)}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Total Credits */}
            <div className="border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <p className="text-xs font-medium text-green-600 dark:text-green-400">Total Credits</p>
              </div>
              <p className="text-base font-semibold text-green-700 dark:text-green-300">
                {formatCurrency(totalCredits)}
              </p>
            </div>

            {/* Total Debits */}
            <div className="border rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Total Debits</p>
              </div>
              <p className="text-base font-semibold text-red-700 dark:text-red-300">
                {formatCurrency(totalDebits)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adjustment Dialog */}
      <WalletAdjustmentDialog
        residentId={residentId}
        currentBalance={balance}
        open={isAdjustmentDialogOpen}
        onOpenChange={setIsAdjustmentDialogOpen}
      />
    </>
  );
}
