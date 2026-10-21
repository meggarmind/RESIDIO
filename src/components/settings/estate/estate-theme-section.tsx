'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { VisualThemeSelector } from '@/components/settings/visual-theme-selector';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { useEstateDefaultTheme, useSetEstateDefaultTheme } from '@/hooks/use-theme-preferences';
import { getAllThemes } from '@/lib/themes/tweakcn-registry';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/** Theme of /settings/estate (from the old Appearance page). One choice is saved for both the dashboard and the portal. */
export function EstateThemeSection() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: dashboardTheme, isLoading: dashboardLoading } = useEstateDefaultTheme('admin-dashboard');
  const setDashboardTheme = useSetEstateDefaultTheme('admin-dashboard');
  const { data: portalTheme, isLoading: portalLoading } = useEstateDefaultTheme('resident-portal');
  const setPortalTheme = useSetEstateDefaultTheme('resident-portal');

  const isLoading = dashboardLoading || portalLoading;
  const isSaving = setDashboardTheme.isPending || setPortalTheme.isPending;

  // The choice made on this page; null until one is made. It stays after a save until the stored theme catches up.
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? (dashboardTheme || portalTheme || 'default');
  const isDirty = picked !== null && (picked !== dashboardTheme || picked !== portalTheme);

  const save = async () => {
    const promises: Promise<unknown>[] = [];
    if (dashboardTheme !== current) {
      promises.push(new Promise((resolve, reject) => setDashboardTheme.mutate(current, { onSuccess: resolve, onError: reject })));
    }
    if (portalTheme !== current) {
      promises.push(new Promise((resolve, reject) => setPortalTheme.mutate(current, { onSuccess: resolve, onError: reject })));
    }

    if (promises.length === 0) {
      toast.info('No changes to save');
      return false;
    }

    try {
      await Promise.all(promises);
      toast.success('Global appearance settings saved successfully');
      return true;
    } catch (error) {
      console.error('Failed to save appearance settings:', error);
      toast.error('Failed to save settings');
      return false;
    }
  };

  return (
    <SettingsSection
      id="theme"
      title="Theme"
      summary={isLoading ? 'Loading' : `Theme: ${getAllThemes().find((theme) => theme.id === current)?.name ?? current}`}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={save}
      onDiscard={() => setPicked(null)}
    >
      <SettingsRow rowId="estate-theme" stacked>
        <div className="w-full">
          {isLoading ? (
            <SettingsSkeleton rows={3} />
          ) : (
            <VisualThemeSelector value={current} onChange={setPicked} context="admin-dashboard" disabled={!canManage || isSaving} />
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
