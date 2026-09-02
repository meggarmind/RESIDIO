'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPendingAccounts,
  approveAccount,
  rejectAccount,
} from '@/actions/auth/account-approval';

const PENDING_ACCOUNTS_KEY = ['pending-accounts'];

/**
 * Accounts that have signed up but hold no access until an administrator
 * approves them.
 */
export function usePendingAccounts() {
  return useQuery({
    queryKey: PENDING_ACCOUNTS_KEY,
    queryFn: async () => {
      const result = await getPendingAccounts();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.accounts;
    },
  });
}

export function useApproveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileId,
      roleId,
      residentId,
    }: {
      profileId: string;
      roleId: string;
      residentId?: string;
    }) => {
      const result = await approveAccount(profileId, roleId, residentId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      // The approved account now holds a role, so the admin lists change too.
      queryClient.invalidateQueries({ queryKey: PENDING_ACCOUNTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['current-admins'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Account approved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve account');
    },
  });
}

export function useRejectAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ profileId, reason }: { profileId: string; reason: string }) => {
      const result = await rejectAccount(profileId, reason);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_ACCOUNTS_KEY });
      toast.success('Account rejected');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject account');
    },
  });
}
