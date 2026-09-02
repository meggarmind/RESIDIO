'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Palette, Save } from 'lucide-react';
import { toast } from 'sonner';
import { VisualThemeSelector } from '@/components/settings/visual-theme-selector';
import {
  useEstateDefaultTheme,
  useSetEstateDefaultTheme,
} from '@/hooks/use-theme-preferences';

type AppearanceSettingsFormProps = {
  initialTheme: string;
  dashboardTheme: string | undefined;
  portalTheme: string | undefined;
  isSaving: boolean;
  onSave: (theme: string) => Promise<boolean>;
};

function AppearanceSettingsForm({
  initialTheme,
  dashboardTheme,
  portalTheme,
  isSaving,
  onSave,
}: AppearanceSettingsFormProps) {
  const [selectedTheme, setSelectedTheme] = useState(initialTheme);
  const [hasSaved, setHasSaved] = useState(false);
  const isDirty = !hasSaved && (selectedTheme !== dashboardTheme || selectedTheme !== portalTheme);

  const handleSave = async () => {
    if (await onSave(selectedTheme)) {
      setHasSaved(true);
    }
  };

  const handleThemeChange = (theme: string) => {
    setSelectedTheme(theme);
    setHasSaved(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h3 className="text-lg font-medium">Appearance Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure the visual appearance of the application.
        </p>
      </div>
      <Separator />

      {/* Global Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Global Theme
          </CardTitle>
          <CardDescription>
            Choose the visual theme for the entire estate interface (Admin Dashboard & Resident Portal).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VisualThemeSelector
            value={selectedTheme}
            onChange={handleThemeChange}
            context="admin-dashboard" // Context mainly used for preview/class application internally if needed
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

export default function AppearanceSettingsPage() {
  // Dashboard theme state
  const { data: dashboardTheme, isLoading: dashboardLoading } = useEstateDefaultTheme('admin-dashboard');
  const setDashboardTheme = useSetEstateDefaultTheme('admin-dashboard');

  // Portal theme state
  const { data: portalTheme, isLoading: portalLoading } = useEstateDefaultTheme('resident-portal');
  const setPortalTheme = useSetEstateDefaultTheme('resident-portal');

  const isLoading = dashboardLoading || portalLoading;
  const isSaving = setDashboardTheme.isPending || setPortalTheme.isPending;

  const handleSave = async (selectedTheme: string) => {
    const promises = [];

    // Save to dashboard theme
    if (dashboardTheme !== selectedTheme) {
      promises.push(
        new Promise((resolve, reject) => {
          setDashboardTheme.mutate(selectedTheme, {
            onSuccess: resolve,
            onError: reject,
          });
        })
      );
    }

    // Save to portal theme
    if (portalTheme !== selectedTheme) {
      promises.push(
        new Promise((resolve, reject) => {
          setPortalTheme.mutate(selectedTheme, {
            onSuccess: resolve,
            onError: reject,
          });
        })
      );
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">Appearance Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure the visual appearance of the application.
          </p>
        </div>
        <Separator />
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <AppearanceSettingsForm
      key={`${dashboardTheme ?? ''}:${portalTheme ?? ''}`}
      initialTheme={dashboardTheme || portalTheme || 'default'}
      dashboardTheme={dashboardTheme}
      portalTheme={portalTheme}
      isSaving={isSaving}
      onSave={handleSave}
    />
  );
}
