'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemSettings, useUpdateSettings, useUpdateSetting } from '@/hooks/use-settings';
import { updateMaintenanceMode } from '@/actions/settings/update-maintenance-mode';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function MaintenancePage() {
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();
  const updateSetting = useUpdateSetting();

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [duplicateMatchingThreshold, setDuplicateMatchingThreshold] = useState(90);
  const [isDirty, setIsDirty] = useState(false);

  const settingsObj = useMemo(() => settingsToObject(systemSettings), [systemSettings]);
  const [initialized, setInitialized] = useState(false);

  if (systemSettings && !initialized) {
    setInitialized(true);
    setMaintenanceMode(settingsObj.maintenance_mode === true);
    setMaintenanceMessage((settingsObj.maintenance_message as string) || 'The system is currently under maintenance. Please try again later.');
    setSessionTimeoutMinutes(Number(settingsObj.session_timeout_minutes) || 60);
    setDuplicateMatchingThreshold(Number(settingsObj.duplicate_matching_threshold) || 90);
  }

  const handleMaintenanceModeToggle = async () => {
    const newValue = !maintenanceMode;
    setMaintenanceMode(newValue);
    const result = await updateMaintenanceMode(newValue, maintenanceMessage);
    if (result.success) {
      toast.success(`Maintenance mode ${newValue ? 'enabled' : 'disabled'}`);
      updateSetting.mutate({ key: 'maintenance_mode', value: newValue });
    } else {
      setMaintenanceMode(!newValue);
      toast.error(result.error || 'Failed to update maintenance mode');
    }
  };

  const handleSaveSettings = () => {
    updateSettings.mutate({
      maintenance_message: maintenanceMessage,
      session_timeout_minutes: sessionTimeoutMinutes,
      duplicate_matching_threshold: duplicateMatchingThreshold,
    }, {
      onSuccess: () => setIsDirty(false),
    });
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Maintenance Mode</h3>
        <p className="text-sm text-muted-foreground">
          Control maintenance mode and system access settings.
        </p>
      </div>
      <Separator />

      <Card className={maintenanceMode ? 'border-amber-300 bg-amber-50/30 dark:bg-amber-950/30' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Maintenance Mode
          </CardTitle>
          <CardDescription>
            Enable maintenance mode to lock out non-admin users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">Only admin users can access the application</p>
            </div>
            <Switch checked={maintenanceMode} onCheckedChange={handleMaintenanceModeToggle} disabled={updateSetting.isPending} />
          </div>
          {maintenanceMode && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Maintenance Mode Active</AlertTitle>
              <AlertDescription>Non-admin users will be redirected to the maintenance page.</AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="space-y-2">
            <Label>Maintenance Message</Label>
            <Textarea
              value={maintenanceMessage}
              onChange={(e) => { setMaintenanceMessage(e.target.value); setIsDirty(true); }}
              placeholder="Enter the message to display during maintenance..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">This message will be shown to users on the maintenance page.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session Settings</CardTitle>
          <CardDescription>Configure user session behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Session Timeout (minutes)</Label>
              <p className="text-sm text-muted-foreground">Inactive users will be logged out after this duration</p>
            </div>
            <Input
              type="number" min={5} max={1440}
              value={sessionTimeoutMinutes}
              onChange={(e) => { setSessionTimeoutMinutes(parseInt(e.target.value) || 60); setIsDirty(true); }}
              className="w-24 text-center"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate Matching</CardTitle>
          <CardDescription>Configure sensitivity for detecting duplicate transactions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Confidence Threshold (%)</Label>
              <p className="text-sm text-muted-foreground">Transactions above this score will be flagged as duplicates</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={100}
                value={duplicateMatchingThreshold}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) { setDuplicateMatchingThreshold(val); setIsDirty(true); }
                }}
                className="w-24 text-center"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={!isDirty || updateSettings.isPending}>
          {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Save Settings
        </Button>
      </div>
    </div>
  );
}
