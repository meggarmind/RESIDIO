'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setPortalAccessOverride } from '@/actions/settings/resident-portal';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/auth/action-roles';
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
}: PortalAccessControlProps) {
  const { hasPermission, profile, refreshPortalVisibility } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const effective = describeEffectiveAccess(generalEnabled, override);

  if (!canEdit) {
    return (
      <span className="text-sm text-muted-foreground" data-testid="portal-access-readonly">
        Resident portal: {effective}
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
      if (profile?.id === profileId) refreshPortalVisibility();
      await queryClient.invalidateQueries({ queryKey: PORTAL_ACCESS_OVERRIDES_QUERY_KEY });
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
      <Select value={toKey(override)} onValueChange={handleChange} disabled={isSaving}>
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
        {effective}
      </span>
    </div>
  );
}
