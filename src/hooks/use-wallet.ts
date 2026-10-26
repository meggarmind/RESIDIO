'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrCreateWallet, getResidentWallets, getWalletTransactions, getYearlyWalletTransactions, creditWallet, debitWallet } from '@/actions/billing/wallet';
import { getWalletTransferTargets, reverseWalletTransfer, transferWalletCredit } from '@/actions/billing/wallet-transfers';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

// Hook to get or create wallet for a resident
export function useWallet(residentId: string) {
  return useQuery({
    queryKey: ['wallet', residentId],
    queryFn: () => getOrCreateWallet(residentId),
    enabled: !!residentId,
  });
}

// Hook to get the total of a resident's wallets and one line per charge category (#1189).
// The key starts with ['wallet', residentId], so every wallet invalidation refreshes it too.
export function useResidentWallets(residentId: string) {
  return useQuery({
    queryKey: ['wallet', residentId, 'by-category'],
    queryFn: async () => {
      const result = await getResidentWallets(residentId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!residentId,
  });
}

// Hook to get wallet transaction history
export function useWalletTransactions(residentId: string, limit = 50) {
  return useQuery({
    queryKey: ['wallet-transactions', residentId, limit],
    queryFn: () => getWalletTransactions(residentId, limit),
    enabled: !!residentId,
  });
}

export function useYearlyWalletTransactions(residentId: string) {
  return useQuery({
    queryKey: ['yearly-wallet-transactions', residentId],
    queryFn: async () => {
      const result = await getYearlyWalletTransactions(residentId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!residentId,
  });
}

// Hook for manual wallet credit (admin only)
export function useCreditWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      residentId,
      amount,
      description,
      reason,
    }: {
      residentId: string;
      amount: number;
      description: string;
      reason: string;
    }) => {
      return creditWallet(residentId, amount, 'adjustment', undefined, `${reason}: ${description}`).then((result) => {
        if (!result.success) throw new Error(result.error || 'Failed to credit wallet');
        return result;
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['yearly-wallet-transactions', variables.residentId] });
      toast.success('Wallet credited successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to credit wallet');
    },
  });
}

// Hook for manual wallet debit (admin only)
export function useDebitWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      residentId,
      amount,
      description,
      reason,
    }: {
      residentId: string;
      amount: number;
      description: string;
      reason: string;
    }) => {
      return debitWallet(residentId, amount, 'adjustment', undefined, `${reason}: ${description}`).then((result) => {
        if (!result.success) throw new Error(result.error || 'Failed to debit wallet');
        return result;
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['yearly-wallet-transactions', variables.residentId] });
      toast.success('Wallet debited successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to debit wallet');
    },
  });
}

// Houses the resident is linked to, with the residents credit can be transferred to (#1191).
export function useWalletTransferTargets(residentId: string, enabled = true) {
  return useQuery({
    queryKey: ['wallet-transfer-targets', residentId],
    queryFn: async () => {
      const result = await getWalletTransferTargets(residentId);
      if (result.error) throw new Error(result.error);
      return result.data || [];
    },
    enabled: !!residentId && enabled,
  });
}

// A transfer touches two wallets, possibly of two residents, and may settle invoices.
function invalidateTransferQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['wallet'] });
  queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
  queryClient.invalidateQueries({ queryKey: ['yearly-wallet-transactions'] });
  queryClient.invalidateQueries({ queryKey: ['invoices'] });
}

// Hook for an admin credit transfer between wallets (#1191)
export function useTransferWalletCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof transferWalletCredit>[0]) => {
      const result = await transferWalletCredit(input);
      if (!result.success) throw new Error(result.error || 'Failed to transfer credit');
      return result;
    },
    onSuccess: (result) => {
      invalidateTransferQueries(queryClient);
      if (result.settlementError) {
        toast.warning(`Credit transferred, but settlement failed: ${result.settlementError}`);
      } else if (result.totalSettled) {
        toast.success(`Credit transferred; ${formatCurrency(result.totalSettled)} settled against unpaid invoices`);
      } else {
        toast.success('Credit transferred');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to transfer credit');
    },
  });
}

// Hook to reverse a credit transfer (#1191)
export function useReverseWalletTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof reverseWalletTransfer>[0]) => {
      const result = await reverseWalletTransfer(input);
      if (!result.success) throw new Error(result.error || 'Failed to reverse the transfer');
      return result;
    },
    onSuccess: () => {
      invalidateTransferQueries(queryClient);
      toast.success('Transfer reversed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reverse the transfer');
    },
  });
}
