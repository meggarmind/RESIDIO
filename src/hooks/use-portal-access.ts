'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getPortalAccessOverrides,
  getResidentPortalEnabled,
} from '@/actions/settings/resident-portal';
import type { PortalAccessOverride } from '@/lib/auth/portal-visibility';

export const RESIDENT_PORTAL_ENABLED_QUERY_KEY = ['resident-portal-enabled'] as const;
export const PORTAL_ACCESS_OVERRIDES_QUERY_KEY = ['portal-access-overrides'] as const;

/** The estate-wide resident-portal switch (#423). Errors read as off. */
export function useResidentPortalEnabled() {
  return useQuery({
    queryKey: RESIDENT_PORTAL_ENABLED_QUERY_KEY,
    queryFn: async () => {
      const result = await getResidentPortalEnabled();
      if (!result.success) throw new Error(result.error || 'Failed to load the resident portal switch');
      return result.data === true;
    },
  });
}

/** Per-user overrides for a batch of profile ids, keyed by profile id. */
export function usePortalAccessOverrides(profileIds: string[]) {
  const ids = [...new Set(profileIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [...PORTAL_ACCESS_OVERRIDES_QUERY_KEY, ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, PortalAccessOverride>> => {
      const result = await getPortalAccessOverrides(ids);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load portal access overrides');
      }
      return result.data;
    },
  });
}
