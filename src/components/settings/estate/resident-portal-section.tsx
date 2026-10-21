'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { setResidentPortalEnabled } from '@/actions/settings/resident-portal';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { RESIDENT_PORTAL_ENABLED_QUERY_KEY, useResidentPortalEnabled } from '@/hooks/use-portal-access';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

/**
 * Resident portal of /settings/estate: the estate-wide switch for resident-portal links in the admin dashboard (#423).
 * Deliberately not routed through useUpdateSetting: that path bypasses the
 * SETTINGS_MANAGE_GENERAL guard and the audit trail.
 */
export function ResidentPortalSection() {
  const { hasPermission, refreshPortalVisibility } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useResidentPortalEnabled();

  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (data !== undefined) setEnabled(data);
  }, [data]);

  async function handleChange(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setIsSaving(true);
    try {
      const result = await setResidentPortalEnabled(next);
      if (!result.success) {
        setEnabled(previous);
        toast.error(result.error || 'Failed to update the resident portal switch');
        return;
      }
      refreshPortalVisibility();
      await queryClient.invalidateQueries({ queryKey: RESIDENT_PORTAL_ENABLED_QUERY_KEY });
    } catch (error) {
      console.error('[ResidentPortalSection] Failed to update resident portal switch:', error);
      setEnabled(previous);
      toast.error('Failed to update the resident portal switch');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsSection
      id="portal"
      title="Resident portal"
      summary={isLoading ? 'Loading' : isError ? 'Could not load' : enabled ? 'Links shown' : 'Links hidden'}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
      defaultCollapsed
      instant
    >
      <SettingsRow rowId="resident-portal-links">
        {({ controlId }) =>
          isLoading ? (
            <Skeleton className="h-6 w-11" />
          ) : isError ? (
            <div role="alert" className="flex items-center gap-4 text-sm">
              <p className="text-destructive">Could not load the resident portal switch.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <Switch id={controlId} checked={enabled} onCheckedChange={handleChange} disabled={!canManage || isSaving} />
          )
        }
      </SettingsRow>
      <p className="border-t px-4 py-4 text-sm text-muted-foreground md:px-5">
        This switch only hides or shows links in the admin dashboard. It does not block the /portal route: anyone who
        opens /portal directly still reaches it.
      </p>
    </SettingsSection>
  );
}
