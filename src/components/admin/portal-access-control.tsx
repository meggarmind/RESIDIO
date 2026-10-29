'use client';

import { useState, useSyncExternalStore } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setPortalAccessOverride } from '@/actions/settings/resident-portal';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { permissionToManage } from '@/lib/auth/board-roles';
import {
  describeEffectiveAccess,
  type PortalAccessOverride,
} from '@/lib/auth/portal-visibility';
import { PORTAL_ACCESS_OVERRIDES_QUERY_KEY } from '@/hooks/use-portal-access';

type SelectValueKey = 'inherit' | 'enabled' | 'disabled';

function toKey(override: PortalAccessOverride): SelectValueKey {
  return override ?? 'inherit';
}

function fromKey(key: string): PortalAccessOverride {
  return key === 'enabled' || key === 'disabled' ? key : null;
}

interface PortalAccessControlProps {
  profileId: string;
  /** The account's current override (null = inherit). */
  override: PortalAccessOverride;
  /** The estate-wide resident-portal switch. */
  generalEnabled: boolean;
  /** Extra classes for the visible label, e.g. to hide it where a column header names the control. */
  labelClassName?: string;
  /** Extra classes for the effective-state text. */
  effectiveClassName?: string;
  /**
   * The account's current role name (`app_roles.name`). A super_admin or chairman
   * account can only be changed by a caller holding system.assign_board_roles (#826).
   */
  targetRoleName?: string | null;
}

/**
 * Inherit / Enabled / Disabled control for one account's resident-portal
 * link visibility (#423). Editable only with SYSTEM_ASSIGN_ROLES; otherwise
 * the effective state is shown read-only.
 */
export function PortalAccessControl({
  profileId,
  override,
  generalEnabled,
  labelClassName,
  effectiveClassName,
  targetRoleName = null,
}: PortalAccessControlProps) {
  const { hasPermission, profile, refreshPortalVisibility } = useAuth();
  const canAssign = hasPermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  const canManageTarget = hasPermission(permissionToManage(targetRoleName));
  const canEdit = canAssign && canManageTarget;
  const queryClient = useQueryClient();
  // The override arrives from the caller's query; until it settles `override` is a
  // placeholder null, which must not read as a real "Inherit".
  const isLoadingOverrides = useIsFetching({ queryKey: PORTAL_ACCESS_OVERRIDES_QUERY_KEY }) > 0;
  // A failed overrides query leaves `override` at the same null placeholder, so it is
  // read off the query cache rather than shown as "Inherit".
  const queryCache = queryClient.getQueryCache();
  const overridesFailed = useSyncExternalStore(
    (onChange) => queryCache.subscribe(onChange),
    () =>
      queryCache
        .findAll({ queryKey: PORTAL_ACCESS_OVERRIDES_QUERY_KEY })
        .some((q) => q.state.status === 'error' && q.state.fetchStatus === 'idle'),
    () => false
  );
  const effective = describeEffectiveAccess(generalEnabled, override);
  const shownState = isLoadingOverrides
    ? 'Loading...'
    : overridesFailed
      ? 'Could not load the current setting'
      : effective;
  const [isSaving, setIsSaving] = useState(false);

  if (!canEdit) {
    return (
      <span className="text-sm text-muted-foreground" data-testid="portal-access-readonly">
        <span className={labelClassName}>Resident portal: </span>
        {shownState}
        {canAssign && !canManageTarget && (
          <span className="block text-xs" data-testid="portal-access-board-only">
            Only holders of Assign Board Roles can change this account.
          </span>
        )}
      </span>
    );
  }

  async function handleChange(value: string) {
    const next = fromKey(value);
    setIsSaving(true);
    try {
      const result = await setPortalAccessOverride(profileId, next);
      if (!result.success) {
        toast.error(result.error || 'Failed to update resident portal access');
        return;
      }
      toast.success('Resident portal access updated');
      try {
        if (profile?.id === profileId) refreshPortalVisibility();
        await queryClient.invalidateQueries(
          { queryKey: PORTAL_ACCESS_OVERRIDES_QUERY_KEY },
          { throwOnError: true }
        );
      } catch (refreshError) {
        console.error('[PortalAccessControl] Saved, but refreshing the overrides failed:', refreshError);
        toast.error('Saved, but the list could not refresh. Reload the page to see the current value.');
      }
    } catch (error) {
      console.error('[PortalAccessControl] Failed to update portal access override:', error);
      toast.error('Failed to update resident portal access');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn('text-xs text-muted-foreground whitespace-nowrap', labelClassName)}>Resident portal</span>
      <Select value={toKey(override)} onValueChange={handleChange} disabled={isSaving || isLoadingOverrides || overridesFailed}>
        <SelectTrigger className="h-8 w-[130px]" aria-label="Resident portal access">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="inherit">Inherit</SelectItem>
          <SelectItem value="enabled">Enabled</SelectItem>
          <SelectItem value="disabled">Disabled</SelectItem>
        </SelectContent>
      </Select>
      <span
        className={cn('text-xs text-muted-foreground whitespace-nowrap', effectiveClassName)}
        data-testid="portal-access-effective"
      >
        {shownState}
      </span>
    </div>
  );
}
