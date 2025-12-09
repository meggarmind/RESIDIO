'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrCreateWallet, getWalletTransactions, creditWallet, debitWallet } from '@/actions/billing/wallet';
import { toast } from 'sonner';

// Hook to get or create wallet for a resident
export function useWallet(residentId: string) {
  return useQuery({
    queryKey: ['wallet', residentId],
    queryFn: () => getOrCreateWallet(residentId),
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
      return creditWallet(residentId, amount, 'adjustment', undefined, `${reason}: ${description}`);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', variables.residentId] });
      toast.success('Wallet credited successfully');
    },
    onError: (error: any) => {
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
      return debitWallet(residentId, amount, 'adjustment', undefined, `${reason}: ${description}`);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallet', variables.residentId] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions', variables.residentId] });
      toast.success('Wallet debited successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to debit wallet');
    },
  });
}
