'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  getPaystackTransactionStatus,
} from '@/actions/paystack';
import { POLLING_INTERVALS } from '@/lib/config/polling';

/**
 * Hook to initialize a Paystack payment
 *
 * On success, redirects user to Paystack payment page
 */
export function useInitializePaystackPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      callbackUrl,
    }: {
      invoiceId: string;
      callbackUrl: string;
    }) => {
      const result = await initializePaystackPayment({
        invoice_id: invoiceId,
        callback_url: callbackUrl,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize payment');
      }

      return result.data;
    },
    onSuccess: (data) => {
      if (data?.authorization_url) {
        toast.success('Redirecting to payment page...');
        // Redirect to Paystack
        setTimeout(() => {
          window.location.href = data.authorization_url;
        }, 500);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initialize payment');
    },
  });
}

/**
 * Hook to verify a Paystack payment
 *
 * Used on callback page to verify and process payment
 */
export function useVerifyPaystackPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reference: string) => {
      const result = await verifyPaystackPayment(reference);

      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['resident-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['resident-indebtedness'] });

      if (data?.status === 'success') {
        toast.success('Payment verified successfully!');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify payment');
    },
  });
}

/**
 * Hook to check Paystack transaction status
 *
 * Used to poll for status updates on pending transactions
 */
export function usePaystackTransactionStatus(reference: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['paystack-transaction', reference],
    queryFn: async () => {
      if (!reference) throw new Error('No reference provided');

      const result = await getPaystackTransactionStatus(reference);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get transaction status');
      }

      return result.status;
    },
    enabled: !!reference && options?.enabled !== false,
    refetchInterval: (query) => {
      const status = query.state.data;
      // Stop polling once we have a final status
      if (status && ['success', 'failed', 'abandoned', 'reversed'].includes(status)) {
        return false;
      }
      // Poll every 5 seconds for pending transactions
      return POLLING_INTERVALS.FAST;
    },
    staleTime: 0, // Always fetch fresh status
  });
}

/**
 * Hook to get Paystack configuration status
 * Returns whether Paystack is properly configured
 */
export function usePaystackConfig() {
  return useQuery({
    queryKey: ['paystack-config'],
    queryFn: async () => {
      // Check if public key is available (client-side check)
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
      return {
        isConfigured: !!publicKey,
        publicKey: publicKey || null,
      };
    },
    staleTime: Infinity, // Config doesn't change during session
  });
}
