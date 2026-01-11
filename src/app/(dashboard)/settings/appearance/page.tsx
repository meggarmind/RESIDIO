'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Palette, Save, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { VisualThemeSelector } from '@/components/settings/visual-theme-selector';
import {
  useEstateDefaultTheme,
  useSetEstateDefaultTheme,
} from '@/hooks/use-theme-preferences';

export default function AppearanceSettingsPage() {
  // Dashboard theme state
  const { data: dashboardTheme, isLoading: dashboardLoading } = useEstateDefaultTheme('admin-dashboard');
  const setDashboardTheme = useSetEstateDefaultTheme('admin-dashboard');

  // Portal theme state
  const { data: portalTheme, isLoading: portalLoading } = useEstateDefaultTheme('resident-portal');
  const setPortalTheme = useSetEstateDefaultTheme('resident-portal');

  // Local state for form
  const [selectedDashboardTheme, setSelectedDashboardTheme] = useState('default');
  const [selectedPortalTheme, setSelectedPortalTheme] = useState('default');
  const [isDirty, setIsDirty] = useState(false);

  const isLoading = dashboardLoading || portalLoading;
  const isSaving = setDashboardTheme.isPending || setPortalTheme.isPending;

  // Load settings when data is fetched
  useEffect(() => {
    if (dashboardTheme) {
      setSelectedDashboardTheme(dashboardTheme);
    }
  }, [dashboardTheme]);

  useEffect(() => {
    if (portalTheme) {
      setSelectedPortalTheme(portalTheme);
    }
  }, [portalTheme]);

  // Track dirty state
  useEffect(() => {
    const dashboardChanged = !!(dashboardTheme && selectedDashboardTheme !== dashboardTheme);
    const portalChanged = !!(portalTheme && selectedPortalTheme !== portalTheme);
    setIsDirty(dashboardChanged || portalChanged);
  }, [selectedDashboardTheme, selectedPortalTheme, dashboardTheme, portalTheme]);

  const handleSave = async () => {
    const promises = [];

    // Save dashboard theme if changed
    if (dashboardTheme && selectedDashboardTheme !== dashboardTheme) {
      promises.push(
        new Promise((resolve, reject) => {
          setDashboardTheme.mutate(selectedDashboardTheme, {
            onSuccess: resolve,
            onError: reject,
          });
        })
      );
    }

    // Save portal theme if changed
    if (portalTheme && selectedPortalTheme !== portalTheme) {
      promises.push(
        new Promise((resolve, reject) => {
          setPortalTheme.mutate(selectedPortalTheme, {
            onSuccess: resolve,
            onError: reject,
          });
        })
      );
    }

    if (promises.length === 0) {
      toast.info('No changes to save');
      return;
    }

    try {
      await Promise.all(promises);
      setIsDirty(false);
      toast.success('Appearance settings saved successfully');
    } catch (error) {
      console.error('Failed to save appearance settings:', error);
      toast.error('Failed to save some settings');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Appearance Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure the visual appearance of the dashboard and resident portal.
          </p>
        </div>
        <Separator />
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h3 className="text-lg font-medium">Appearance Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure the visual appearance of the dashboard and resident portal.
        </p>
      </div>
      <Separator />

      {/* Admin Dashboard Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Admin Dashboard Theme
          </CardTitle>
          <CardDescription>
            Choose the default visual theme for the admin dashboard. This affects the color palette,
            typography, and overall visual style.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VisualThemeSelector
            value={selectedDashboardTheme}
            onChange={setSelectedDashboardTheme}
            context="admin-dashboard"
            disabled={isSaving}
          />
        </CardContent>
      </Card>

      {/* Resident Portal Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Resident Portal Theme
          </CardTitle>
          <CardDescription>
            Choose the default visual theme for the resident portal. Residents can override this
            with their personal preference in their profile settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VisualThemeSelector
            value={selectedPortalTheme}
            onChange={setSelectedPortalTheme}
            context="resident-portal"
            disabled={isSaving}
          />
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          size="lg"
        >
          {isSaving ? (
            <>
              <Save className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
