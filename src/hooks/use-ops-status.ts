'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { OPS_STATUS_COOKIE, decodeOpsStatus, type OpsStatus } from '@/lib/settings/ops-status';

const subscribe = () => () => {};

function readCookie(): string | undefined {
  const prefix = `${OPS_STATUS_COOKIE}=`;
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * Maintenance mode and communications override state for the current admin
 * (#789), from the cookie the middleware refreshes on every request, so it
 * costs no query. Each state is shown only to holders of the permission for
 * its settings page; the banner's link would bounce anyone else.
 */
export function useOpsStatus(): OpsStatus {
  // Re-render on navigation: that is when the middleware has refreshed the cookie.
  usePathname();
  const raw = useSyncExternalStore(subscribe, readCookie, () => undefined);
  const { hasPermission } = useAuth();
  const status = decodeOpsStatus(raw);
  return {
    maintenance: !!status?.maintenance && hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE),
    commsOverride: !!status?.commsOverride && hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL),
  };
}
