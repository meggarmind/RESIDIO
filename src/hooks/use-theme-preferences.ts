import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEstateDefaultTheme,
  setEstateDefaultTheme,
  getUserThemeOverride,
  setUserThemeOverride,
  getEffectiveTheme,
} from '@/actions/settings/theme-preferences';
import { toast } from 'sonner';

type ThemeContext = 'admin-dashboard' | 'resident-portal';

/**
 * Get estate's default theme for a context
 */
export function useEstateDefaultTheme(context: ThemeContext) {
  return useQuery({
    queryKey: ['estate-theme', context],
    queryFn: () => getEstateDefaultTheme(context),
    select: (response) => response.data,
  });
}

/**
 * Set estate's default theme
 */
export function useSetEstateDefaultTheme(context: ThemeContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (themeId: string) => setEstateDefaultTheme(context, themeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estate-theme', context] });
      queryClient.invalidateQueries({ queryKey: ['effective-theme', context] });
      toast.success('Estate theme updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update theme: ${error.message}`);
    },
  });
}

/**
 * Get user's theme override
 */
export function useUserThemeOverride(context: ThemeContext) {
  return useQuery({
    queryKey: ['user-theme-override', context],
    queryFn: () => getUserThemeOverride(context),
    select: (response) => response.data,
    staleTime: Infinity, // Never consider cache stale - rely on optimistic updates from mutations
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes after component unmount
  });
}

/**
 * Set user's theme override
 */
export function useSetUserThemeOverride(context: ThemeContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (themeId: string | null) => setUserThemeOverride(context, themeId),

    // ADD: Optimistic update for instant UI feedback
    onMutate: async (newTheme) => {
      // Cancel any outgoing refetches (so they don't overwrite optimistic update)
      await queryClient.cancelQueries({ queryKey: ['user-theme-override', context] });
      await queryClient.cancelQueries({ queryKey: ['effective-theme', context] });

      // Snapshot the previous values for rollback
      const previousOverride = queryClient.getQueryData(['user-theme-override', context]);
      const previousEffective = queryClient.getQueryData(['effective-theme', context]);

      // Optimistically update to the new value
      queryClient.setQueryData(['user-theme-override', context], { data: newTheme, error: null });
      if (newTheme === null) {
        // If clearing override, effective theme falls back to estate default
        const estateTheme = queryClient.getQueryData(['estate-theme', context]);
        queryClient.setQueryData(['effective-theme', context], { data: estateTheme || 'default', error: null });
      } else {
        queryClient.setQueryData(['effective-theme', context], { data: newTheme, error: null });
      }

      // Return context with previous values for rollback
      return { previousOverride, previousEffective };
    },

    onError: (err: Error, newTheme, rollbackContext) => {
      // Rollback to previous values on error
      if (rollbackContext) {
        queryClient.setQueryData(['user-theme-override', context], rollbackContext.previousOverride);
        queryClient.setQueryData(['effective-theme', context], rollbackContext.previousEffective);
      }
      toast.error(`Failed to update theme: ${err.message}`);
    },

    onSuccess: (_data, themeId) => {
      // No need to invalidate - optimistic updates already set the correct cache values
      // Invalidation would trigger unnecessary refetches that could overwrite with stale data
      toast.success(themeId === null ? 'Reset to estate default' : 'Personal theme updated');
    },
  });
}

/**
 * Get the effective theme (override → estate default → default)
 */
export function useEffectiveTheme(context: ThemeContext) {
  return useQuery({
    queryKey: ['effective-theme', context],
    queryFn: () => getEffectiveTheme(context),
    select: (response) => response.data,
    staleTime: Infinity, // Never consider cache stale - rely on optimistic updates from mutations
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes after component unmount
  });
}
