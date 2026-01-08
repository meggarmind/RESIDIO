'use client';

/**
 * Navigation Hook
 *
 * Provides permission-filtered navigation items for the admin dashboard.
 * Centralizes filtering logic that was previously duplicated in sidebar components.
 *
 * Key benefits:
 * - Single source of truth for navigation filtering
 * - Memoized for performance
 * - Consistent behavior across all navigation components
 */

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  ADMIN_NAV_ITEMS,
  MOBILE_NAV_IDS,
  type NavItem,
} from '@/config/navigation';

export interface UseNavigationOptions {
  /** Include children in output (default: true) */
  includeChildren?: boolean;
  /** Only include items with these IDs (for mobile subset) */
  filterIds?: readonly string[];
}

export interface UseNavigationResult {
  /** Filtered navigation items based on user permissions */
  navItems: NavItem[];
  /** Whether auth data is still loading */
  isLoading: boolean;
}

/**
 * Hook for getting permission-filtered admin navigation items
 *
 * @param options - Configuration options
 * @returns Filtered navigation items and loading state
 *
 * @example
 * // Full navigation (sidebars)
 * const { navItems } = useNavigation();
 *
 * @example
 * // Mobile navigation (subset of items)
 * const { navItems } = useNavigation({ filterIds: MOBILE_NAV_IDS });
 */
export function useNavigation(
  options: UseNavigationOptions = {}
): UseNavigationResult {
  const { includeChildren = true, filterIds } = options;
  const { isLoading, hasAnyPermission } = useAuth();

  const navItems = useMemo(() => {
    const filterItem = (item: NavItem): NavItem | null => {
      // If specific IDs requested, check membership
      if (filterIds && !filterIds.includes(item.id)) {
        return null;
      }

      // Check permissions (skip during loading for optimistic UI)
      if (item.permissions && !isLoading) {
        if (!hasAnyPermission(item.permissions)) {
          return null;
        }
      }

      // No permissions = visible to all authenticated users
      // While loading, show items (optimistic UI to prevent flash)

      // Filter children recursively if applicable
      if (includeChildren && item.children) {
        const filteredChildren = item.children
          .map(filterItem)
          .filter((child): child is NavItem => child !== null);

        return {
          ...item,
          children: filteredChildren.length > 0 ? filteredChildren : undefined,
        };
      }

      // For mobile (no children), strip children from output
      if (!includeChildren) {
        return { ...item, children: undefined };
      }

      return item;
    };

    return ADMIN_NAV_ITEMS.map(filterItem).filter(
      (item): item is NavItem => item !== null
    );
  }, [isLoading, hasAnyPermission, includeChildren, filterIds]);

  return { navItems, isLoading };
}

/**
 * Convenience hook for mobile navigation
 *
 * Returns a simplified subset of navigation items suitable for mobile display.
 * Uses permission-based filtering (upgraded from legacy role-based filtering).
 *
 * Includes: Dashboard, Residents, Payments, Security, Settings
 */
export function useMobileNavigation(): UseNavigationResult {
  return useNavigation({
    includeChildren: false,
    filterIds: MOBILE_NAV_IDS,
  });
}

// Re-export NavItem type for component usage
export type { NavItem } from '@/config/navigation';
