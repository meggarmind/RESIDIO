'use client';

/**
 * Settings Navigation Hook
 *
 * Permission-filtered settings navigation, so an admin is shown the settings
 * pages they can actually open rather than every page with the middleware left
 * to bounce them.
 *
 * Deliberately the same shape as `useSectionedNavigation` in `use-navigation.ts`,
 * which does this for the main sidebar — including the optimistic "show while
 * loading" behaviour that stops the nav flashing empty on first paint.
 */

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { settingsConfig, type SettingsGroup, type SettingsItem } from '@/config/settings-nav';

export interface UseSettingsNavigationResult {
  /** Groups with unreachable items removed; empty groups are dropped entirely. */
  groups: SettingsGroup[];
  isLoading: boolean;
}

export function useSettingsNavigation(): UseSettingsNavigationResult {
  const { isLoading, hasAnyPermission } = useAuth();

  const groups = useMemo(() => {
    const filterItem = (item: SettingsItem): SettingsItem | null => {
      // While permissions are still loading, show everything rather than
      // rendering an empty sidebar and then filling it in.
      if (item.permissions && !isLoading && !hasAnyPermission(item.permissions)) {
        return null;
      }

      if (item.children) {
        const children = item.children
          .map(filterItem)
          .filter((child): child is SettingsItem => child !== null);

        // A parent whose children are all hidden has nothing to link to.
        if (children.length === 0) return null;
        return { ...item, children };
      }

      return item;
    };

    return settingsConfig
      .map((group) => ({
        ...group,
        items: group.items
          .map(filterItem)
          .filter((item): item is SettingsItem => item !== null),
      }))
      .filter((group) => group.items.length > 0);
  }, [isLoading, hasAnyPermission]);

  return { groups, isLoading };
}
