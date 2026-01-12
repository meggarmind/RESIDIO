'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResidentWallet, useWalletTransactions } from '@/hooks/use-billing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletTopUpDialog } from '@/components/resident-portal/wallet-topup-dialog';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { Wallet as WalletIcon, Plus, ArrowUpRight, ArrowDownRight, Search, X } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';

// Spring physics for smooth animations
const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

// Card animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      ...spring,
      delay: custom * 0.1,
    },
  }),
};

export default function WalletPage() {
  const { residentId } = useAuth();
  const { data: wallet, isLoading: walletLoading } = useResidentWallet(residentId || undefined);
  const { data: transactions, isLoading: transactionsLoading } = useWalletTransactions(residentId || undefined);
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isLoading = walletLoading || transactionsLoading;

  const walletBalance = wallet?.balance || 0;
  const walletTransactions = transactions || [];

  // Filter transactions based on type and search
  const filteredTransactions = useMemo(() => {
    return walletTransactions.filter((t) => {
      // Type filter
      if (typeFilter !== 'all' && t.type !== typeFilter) {
        return false;
      }
      // Search filter (by description)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const description = (t.description || '').toLowerCase();
        const type = t.type === 'credit' ? 'top up' : 'payment';
        return description.includes(query) || type.includes(query);
      }
      return true;
    });
  }, [walletTransactions, typeFilter, searchQuery]);

  // Count by type for filter badges
  const creditCount = walletTransactions.filter(t => t.type === 'credit').length;
  const debitCount = walletTransactions.filter(t => t.type === 'debit').length;

  if (isLoading) {
    return <WalletSkeleton />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <div>
          <h1 className="text-[28px] font-bold text-bill-text tracking-tight">Wallet</h1>
          <p className="text-bill-text-secondary mt-1">
            Manage your wallet balance and transactions
          </p>
        </div>
        <Button onClick={() => setTopUpDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Top Up Wallet
        </Button>
      </motion.div>

      {/* Balance Card */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        custom={0}
      >
        <Card className="bg-gradient-to-br from-[#111827] to-[#1f2937] border-0 text-white">
          <CardHeader>
            <CardTitle className="text-white/70 text-sm font-medium">Current Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-5xl font-bold mb-2">
                  <AnimatedCounter
                    value={walletBalance}
                    formatter={formatCurrency}
                  />
                </div>
                <p className="text-white/60 text-sm">
                  Available for invoice payments
                </p>
              </div>
              <WalletIcon className="h-16 w-16 text-white/20" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Transactions Section */}
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        custom={1}
      >
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle>Transaction History</CardTitle>

            {/* Filters */}
            {walletTransactions.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Type Filter Tabs */}
                <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)} className="w-full sm:w-auto">
                  <TabsList className="grid w-full sm:w-auto grid-cols-3">
                    <TabsTrigger value="all" className="text-xs sm:text-sm">
                      All ({walletTransactions.length})
                    </TabsTrigger>
                    <TabsTrigger value="credit" className="text-xs sm:text-sm">
                      Credits ({creditCount})
                    </TabsTrigger>
                    <TabsTrigger value="debit" className="text-xs sm:text-sm">
                      Debits ({debitCount})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Search Input */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {walletTransactions.length === 0 ? (
              <div className="py-12 text-center">
                <WalletIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-bill-text mb-2">No Transactions Yet</h3>
                <p className="text-sm text-bill-text-secondary">
                  Your wallet transactions will appear here
                </p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-bill-text mb-2">No Results Found</h3>
                <p className="text-sm text-bill-text-secondary">
                  Try adjusting your search or filters
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                {filteredTransactions.map((transaction, index) => (
                  <motion.div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          transaction.type === 'credit'
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {transaction.type === 'credit' ? (
                          <ArrowDownRight className="h-5 w-5" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-bill-text">
                          {transaction.type === 'credit' ? 'Top Up' : 'Payment'}
                        </p>
                        <p className="text-sm text-bill-text-secondary">
                          {transaction.created_at && format(new Date(transaction.created_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          transaction.type === 'credit'
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}
                      >
                        {transaction.type === 'credit' ? '+' : '-'}
                        {formatCurrency(transaction.amount || 0)}
                      </p>
                      {transaction.description && (
                        <p className="text-xs text-bill-text-secondary">
                          {transaction.description}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Up Dialog */}
      <WalletTopUpDialog
        open={topUpDialogOpen}
        onOpenChange={setTopUpDialogOpen}
        currentBalance={walletBalance}
      />
    </div>
  );
}

function WalletSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
