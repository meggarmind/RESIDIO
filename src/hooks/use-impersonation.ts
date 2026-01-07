'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  canImpersonate,
  startImpersonationSession,
  endImpersonationSession,
  getActiveImpersonation,
  searchResidentsForImpersonation,
  logImpersonationPageView,
  getImpersonationHistory,
} from '@/actions/impersonation';
import type {
  ImpersonationState,
  ImpersonationSessionWithDetails,
  ResidentForImpersonation,
} from '@/types/database';

// Session storage key for impersonation state
const IMPERSONATION_STORAGE_KEY = 'residio_impersonation';

// Query keys
const IMPERSONATION_STATUS_KEY = ['impersonation-status'];
const ACTIVE_IMPERSONATION_KEY = ['active-impersonation'];
const IMPERSONATION_HISTORY_KEY = ['impersonation-history'];

/**
 * Get impersonation state from session storage
 */
function getStoredImpersonationState(): ImpersonationState | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Store impersonation state in session storage
 */
function setStoredImpersonationState(state: ImpersonationState | null): void {
  if (typeof window === 'undefined') return;

  if (state) {
    sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(state));
  } else {
    sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  }
}

/**
 * Check if current user can impersonate
 * @param options.enabled - Set to false to skip this query (PERFORMANCE: for non-admin users)
 */
export function useCanImpersonate(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: IMPERSONATION_STATUS_KEY,
    queryFn: canImpersonate,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled !== false, // Default to true
  });
}

/**
 * Get the active impersonation session
 * @param options.enabled - Set to false to skip this query (PERFORMANCE: for non-admin users)
 */
export function useActiveImpersonation(options?: { enabled?: boolean }) {
  const [localState, setLocalState] = useState<ImpersonationState | null>(null);
  const isEnabled = options?.enabled !== false;

  // Initialize from session storage on mount
  useEffect(() => {
    if (!isEnabled) return;
    const stored = getStoredImpersonationState();
    setLocalState(stored);
  }, [isEnabled]);

  const query = useQuery({
    queryKey: ACTIVE_IMPERSONATION_KEY,
    queryFn: async () => {
      const result = await getActiveImpersonation();
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: isEnabled,
  });

  // Sync query result to local state and session storage
  useEffect(() => {
    if (query.data) {
      const newState: ImpersonationState = {
        isActive: true,
        sessionId: query.data.id,
        impersonatedResidentId: query.data.impersonated_resident_id,
        impersonatedResidentName: `${query.data.resident.first_name} ${query.data.resident.last_name}`,
        impersonatedHouseAddress: query.data.house?.address || null,
        startedAt: query.data.started_at,
      };
      setLocalState(newState);
      setStoredImpersonationState(newState);
    } else if (query.isSuccess && !query.data) {
      // Query completed successfully with no active session - clear storage
      setLocalState(null);
      setStoredImpersonationState(null);
    } else if (query.isError) {
      // Query failed - clear storage to prevent stale state
      setLocalState(null);
      setStoredImpersonationState(null);
    }
  }, [query.data, query.isSuccess, query.isError]);

  return {
    ...query,
    impersonationState: localState,
    // Only truly impersonating if query confirms OR still loading with storage data
    isImpersonating: query.isLoading
      ? (localState?.isActive ?? false)  // Trust storage while loading (for fast UI)
      : (query.data != null),            // Only trust query result once loaded
  };
}

/**
 * Start an impersonation session
 */
export function useStartImpersonation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (residentId: string) => {
      const result = await startImpersonationSession(residentId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (data) => {
      if (data) {
        // Store in session storage
        const newState: ImpersonationState = {
          isActive: true,
          sessionId: data.id,
          impersonatedResidentId: data.impersonated_resident_id,
          impersonatedResidentName: `${data.resident.first_name} ${data.resident.last_name}`,
          impersonatedHouseAddress: data.house?.address || null,
          startedAt: data.started_at,
        };
        setStoredImpersonationState(newState);

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ACTIVE_IMPERSONATION_KEY });

        toast.success(`Now viewing portal as ${data.resident.first_name} ${data.resident.last_name}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start impersonation');
    },
  });
}

/**
 * End an impersonation session
 */
export function useEndImpersonation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const result = await endImpersonationSession(sessionId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      // Clear session storage
      setStoredImpersonationState(null);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ACTIVE_IMPERSONATION_KEY });
      queryClient.invalidateQueries({ queryKey: IMPERSONATION_HISTORY_KEY });

      toast.success('Impersonation session ended');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to end impersonation');
    },
  });
}

/**
 * Search residents for impersonation
 */
export function useSearchResidentsForImpersonation() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const query = useQuery({
    queryKey: ['impersonation-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return [] as ResidentForImpersonation[];
      }
      const result = await searchResidentsForImpersonation(debouncedQuery);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data || [];
    },
    enabled: debouncedQuery.length >= 2,
  });

  return {
    ...query,
    searchQuery,
    setSearchQuery,
    residents: query.data || [],
  };
}

/**
 * Log a page view during impersonation
 */
export function useLogImpersonationPageView() {
  return useMutation({
    mutationFn: async ({ sessionId, path }: { sessionId: string; path: string }) => {
      const result = await logImpersonationPageView(sessionId, path);
      if (!result.success) {
        // Silent failure for page view logging
        console.error('Failed to log page view:', result.error);
      }
      return result;
    },
    onError: (error: Error) => {
      // Silent failure for page view logging
      console.error('Failed to log page view:', error.message);
    },
  });
}

/**
 * Get impersonation session history
 */
export function useImpersonationHistory(params: {
  adminId?: string;
  residentId?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [IMPERSONATION_HISTORY_KEY, params],
    queryFn: async () => {
      const result = await getImpersonationHistory(params);
      if (!result.success) {
        throw new Error(result.error);
      }
      return {
        sessions: result.data || [],
        total: result.total || 0,
      };
    },
  });
}

/**
 * Combined hook for impersonation management
 * Provides a complete interface for managing impersonation state
 * @param options.skip - Set to true to skip all impersonation queries (PERFORMANCE: for non-admin users)
 */
export function useImpersonation(options?: { skip?: boolean }) {
  const isEnabled = !options?.skip;
  const canImpersonateQuery = useCanImpersonate({ enabled: isEnabled });
  const activeQuery = useActiveImpersonation({ enabled: isEnabled });
  const startMutation = useStartImpersonation();
  const endMutation = useEndImpersonation();
  const searchHook = useSearchResidentsForImpersonation();
  const logPageViewMutation = useLogImpersonationPageView();

  const startImpersonation = useCallback(async (residentId: string) => {
    return startMutation.mutateAsync(residentId);
  }, [startMutation]);

  const endImpersonation = useCallback(async () => {
    // Try query state first, fall back to session storage
    let sessionId = activeQuery.impersonationState?.sessionId;

    if (!sessionId) {
      // Fallback to session storage if React Query state is stale
      const stored = getStoredImpersonationState();
      sessionId = stored?.sessionId;
    }

    if (!sessionId) {
      throw new Error('No active impersonation session found');
    }

    return endMutation.mutateAsync(sessionId);
  }, [endMutation, activeQuery.impersonationState?.sessionId]);

  const logPageView = useCallback(async (path: string) => {
    if (activeQuery.impersonationState?.sessionId) {
      return logPageViewMutation.mutateAsync({
        sessionId: activeQuery.impersonationState.sessionId,
        path,
      });
    }
  }, [logPageViewMutation, activeQuery.impersonationState?.sessionId]);

  return {
    // Status
    canImpersonate: canImpersonateQuery.data?.canImpersonate ?? false,
    requiresApproval: canImpersonateQuery.data?.requiresApproval ?? false,
    isSuperAdmin: canImpersonateQuery.data?.isSuperAdmin ?? false,
    impersonationEnabled: canImpersonateQuery.data?.impersonationEnabled ?? false,
    isLoading: canImpersonateQuery.isLoading || activeQuery.isLoading,

    // Active session
    isImpersonating: activeQuery.isImpersonating,
    impersonationState: activeQuery.impersonationState,
    activeSession: activeQuery.data,

    // Actions
    startImpersonation,
    endImpersonation,
    logPageView,
    isStarting: startMutation.isPending,
    isEnding: endMutation.isPending,

    // Search
    searchQuery: searchHook.searchQuery,
    setSearchQuery: searchHook.setSearchQuery,
    searchResults: searchHook.residents,
    isSearching: searchHook.isLoading,
  };
}
