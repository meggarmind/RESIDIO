'use client';

/**
 * Gmail Connection React Query Hooks
 *
 * Provides hooks for managing Gmail OAuth connection state.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getGmailConnectionStatus,
  getGmailAuthUrl,
  disconnectGmail,
} from '@/actions/email-imports/gmail-oauth';
import { toast } from 'sonner';

// Query keys
export const gmailKeys = {
  all: ['gmail'] as const,
  connectionStatus: () => [...gmailKeys.all, 'connection-status'] as const,
};

/**
 * Hook to get Gmail connection status.
 */
export function useGmailConnectionStatus() {
  return useQuery({
    queryKey: gmailKeys.connectionStatus(),
    queryFn: async () => {
      const result = await getGmailConnectionStatus();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to initiate Gmail OAuth connection.
 */
export function useConnectGmail() {
  return useMutation({
    mutationFn: async () => {
      const result = await getGmailAuthUrl();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Redirect to Google OAuth consent page
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start Gmail connection');
    },
  });
}

/**
 * Hook to disconnect Gmail.
 */
export function useDisconnectGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await disconnectGmail();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Gmail disconnected successfully');
      // Invalidate connection status
      queryClient.invalidateQueries({ queryKey: gmailKeys.connectionStatus() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect Gmail');
    },
  });
}
