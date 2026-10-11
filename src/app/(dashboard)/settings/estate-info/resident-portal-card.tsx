'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { setResidentPortalEnabled } from '@/actions/settings/resident-portal';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { RESIDENT_PORTAL_ENABLED_QUERY_KEY, useResidentPortalEnabled } from '@/hooks/use-portal-access';

/**
 * Estate-wide switch for resident-portal links in the admin dashboard (#423).
 * Deliberately not routed through useUpdateSetting: that path bypasses the
 * SETTINGS_MANAGE_GENERAL guard and the audit trail.
 */
export function ResidentPortalCard() {
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
      console.error('[ResidentPortalCard] Failed to update resident portal switch:', error);
      setEnabled(previous);
      toast.error('Failed to update the resident portal switch');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resident portal</CardTitle>
        <CardDescription>
          Show the resident portal links in the admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : isError ? (
          <div role="alert" className="flex items-center justify-between gap-4 text-sm">
            <p className="text-destructive">Could not load the resident portal switch.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-6">
              <div className="space-y-1">
                <Label htmlFor="resident-portal-enabled">Show resident portal links</Label>
                <p className="text-sm text-muted-foreground">
                  Applies to everyone unless an account has its own setting under System, Accounts.
                </p>
              </div>
              <Switch
                id="resident-portal-enabled"
                checked={enabled}
                onCheckedChange={handleChange}
                disabled={!canManage || isSaving}
                aria-label="Show resident portal links"
              />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">
              This switch only hides or shows links in the admin dashboard. It does not block the /portal
              route: anyone who opens /portal directly still reaches it.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
