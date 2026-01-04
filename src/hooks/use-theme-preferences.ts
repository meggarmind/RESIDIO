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
  });
}

/**
 * Set user's theme override
 */
export function useSetUserThemeOverride(context: ThemeContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (themeId: string | null) => setUserThemeOverride(context, themeId),
    onSuccess: (_data, themeId) => {
      queryClient.invalidateQueries({ queryKey: ['user-theme-override', context] });
      queryClient.invalidateQueries({ queryKey: ['effective-theme', context] });
      toast.success(themeId === null ? 'Reset to estate default' : 'Personal theme updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update theme: ${error.message}`);
    },
  });
}

/**
 * Get the effective theme (override → estate default → nahid)
 */
export function useEffectiveTheme(context: ThemeContext) {
  return useQuery({
    queryKey: ['effective-theme', context],
    queryFn: () => getEffectiveTheme(context),
    select: (response) => response.data,
    staleTime: 1000 * 60, // 1 minute (reduced from 5 for better theme change responsiveness)
  });
}
