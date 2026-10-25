'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconBox } from '@/components/ui/icon-box';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet, useYearlyWalletTransactions } from '@/hooks/use-wallet';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
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
  // Shares its cache key with the Transaction History ledger, so the Money tab
  // makes one ledger request rather than a separate 1000-row fetch (#783).
  const { data: yearlyData } = useYearlyWalletTransactions(residentId);

  // CORE.md s6: a write control is gated on the WRITE permission, never on the
  // route's view permission. A viewer without `billing.manage_wallets` still
  // sees the balance, but gets no adjustment affordance.
  const { hasPermission } = useAuth();
  const canAdjustWallet = hasPermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
  const canShowAdjustment = showActions && canAdjustWallet;

  if (walletLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  const wallet = walletData?.data;
  const balance = wallet?.balance || 0;
  const years = yearlyData || [];
  const totalCredits = years.reduce((sum, y) => sum + y.total_credits, 0);
  const totalDebits = years.reduce((sum, y) => sum + y.total_debits, 0);

  const balanceColor = balance > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <IconBox color="green" size="sm" className="h-8 w-8">
                <Wallet className="h-4 w-4" />
              </IconBox>
              Wallet balance
            </p>
            {canShowAdjustment && (
              <Button size="sm" variant="outline" className="h-7 text-xs min-h-11 md:min-h-0" onClick={() => setIsAdjustmentDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adjust
              </Button>
            )}
          </div>
          <p className={`text-2xl font-bold ${balanceColor}`}>{formatCurrency(balance)}</p>
          <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <div>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                Total credits
              </dt>
              <dd className="mt-0.5 text-sm font-semibold">{formatCurrency(totalCredits)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                Total debits
              </dt>
              <dd className="mt-0.5 text-sm font-semibold">{formatCurrency(totalDebits)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Adjustment Dialog -- mounted only for holders of billing.manage_wallets */}
      {canShowAdjustment && (
        <WalletAdjustmentDialog
          residentId={residentId}
          currentBalance={balance}
          open={isAdjustmentDialogOpen}
          onOpenChange={setIsAdjustmentDialogOpen}
        />
      )}
    </>
  );
}
