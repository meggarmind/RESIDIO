import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  searchAuthAccountsByEmail,
  getOrphanedAuthAccounts,
  linkAuthAccountToResident,
  unlinkAuthAccount,
  type AuthAccountSearchResult,
  type OrphanedAuthAccount,
} from '@/actions/auth/link-account';
import { toast } from 'sonner';

// Query keys
export const authAccountKeys = {
  all: ['auth-accounts'] as const,
  search: (email: string) => [...authAccountKeys.all, 'search', email] as const,
  orphaned: () => [...authAccountKeys.all, 'orphaned'] as const,
};

/**
 * Hook to search for auth accounts by email.
 */
export function useSearchAuthAccounts(email: string) {
  return useQuery({
    queryKey: authAccountKeys.search(email),
    queryFn: async () => {
      const result = await searchAuthAccountsByEmail(email);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.accounts;
    },
    enabled: email.length >= 3,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Hook to get orphaned auth accounts (accounts without resident links).
 */
export function useOrphanedAuthAccounts() {
  return useQuery({
    queryKey: authAccountKeys.orphaned(),
    queryFn: async () => {
      const result = await getOrphanedAuthAccounts();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.accounts;
    },
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Hook to link an auth account to a resident.
 */
export function useLinkAuthAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      authUserId,
      residentId,
      forceRelink,
    }: {
      authUserId: string;
      residentId: string;
      forceRelink?: boolean;
    }) => {
      const result = await linkAuthAccountToResident(authUserId, residentId, forceRelink);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: authAccountKeys.all });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });

      if (data.previousResidentId) {
        toast.success('Account relinked successfully');
      } else {
        toast.success('Account linked successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to link account');
    },
  });
}

/**
 * Hook to unlink an auth account from its resident.
 */
export function useUnlinkAuthAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (authUserId: string) => {
      const result = await unlinkAuthAccount(authUserId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: authAccountKeys.all });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });

      toast.success('Account unlinked successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unlink account');
    },
  });
}
