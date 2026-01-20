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
  updateSyncCriteria,
} from '@/actions/email-imports/gmail-oauth';
import { cancelImport, retryImportProcessing } from '@/actions/email-imports/control-import';
import { resetEmailImports } from '@/actions/email-imports/reset-email-imports';
import { fetchNewEmails } from '@/actions/email-imports/fetch-emails';
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
/**
 * Hook to manually trigger Gmail fetch.
 */
export function useManualFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await fetchNewEmails({ trigger: 'manual' });
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch emails');
      }
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Fetch complete: ${result.emailsFetched} emails fetched.`);
      // Invalidate connection status to show latest sync results
      queryClient.invalidateQueries({ queryKey: gmailKeys.connectionStatus() });
      // Invalidate email imports list to refresh the Import History table
      queryClient.invalidateQueries({ queryKey: ['email-imports'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook to update Gmail sync criteria.
 */
export function useUpdateSyncCriteria() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (criteria: any) => {
      const result = await updateSyncCriteria(criteria);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Sync criteria updated');
      queryClient.invalidateQueries({ queryKey: gmailKeys.connectionStatus() });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
export function useCancelImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      const result = await cancelImport(importId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel import');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Import cancelled');
      queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      queryClient.invalidateQueries({ queryKey: ['email-imports'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Hook to retry processing a stuck/failed import.
 */
/**
 * Hook to reset all email imports.
 */
export function useResetEmailImports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await resetEmailImports();
      if (!result.success) {
        throw new Error(result.error || 'Failed to reset email imports');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('All email import data has been reset');
      queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      queryClient.invalidateQueries({ queryKey: ['email-imports'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset email imports');
    },
  });
}

export function useRetryImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (importId: string) => {
      const result = await retryImportProcessing(importId);
      if (!result.success) {
        throw new Error(result.error || 'Failed to retry import');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Retry started');
      queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      queryClient.invalidateQueries({ queryKey: ['email-imports'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
