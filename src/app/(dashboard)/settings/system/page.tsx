'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Save, Server, Clock, Database, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemSettings, useUpdateSettings, useUpdateSetting } from '@/hooks/use-settings';
import { updateMaintenanceMode } from '@/actions/settings/update-maintenance-mode';

// Helper to convert settings array to key-value object
function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function SystemSettingsPage() {
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();
  const updateSetting = useUpdateSetting();

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState(365);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [isDirty, setIsDirty] = useState(false);

  // Load settings into form when data is fetched
  useEffect(() => {
    if (systemSettings) {
      const settingsObj = settingsToObject(systemSettings);
      setMaintenanceMode(settingsObj.maintenance_mode === true);
      setMaintenanceMessage((settingsObj.maintenance_message as string) || 'The system is currently under maintenance. Please try again later.');
      setAuditLogRetentionDays(Number(settingsObj.audit_log_retention_days) || 365);
      setSessionTimeoutMinutes(Number(settingsObj.session_timeout_minutes) || 60);
      setIsDirty(false);
    }
  }, [systemSettings]);

  const handleMaintenanceModeToggle = async () => {
    const newValue = !maintenanceMode;
    setMaintenanceMode(newValue);

    // Use the proper server action with permission checks and audit logging
    const result = await updateMaintenanceMode(newValue, maintenanceMessage);

    if (result.success) {
      toast.success(`Maintenance mode ${newValue ? 'enabled' : 'disabled'}`);
      // Refresh settings to show updated value
      updateSetting.mutate({ key: 'maintenance_mode', value: newValue });
    } else {
      // Revert on error
      setMaintenanceMode(!newValue);
      toast.error(result.error || 'Failed to update maintenance mode');
    }
  };

  const handleSaveSettings = () => {
    updateSettings.mutate({
      maintenance_message: maintenanceMessage,
      audit_log_retention_days: auditLogRetentionDays,
      session_timeout_minutes: sessionTimeoutMinutes,
    }, {
      onSuccess: () => {
        setIsDirty(false);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium">System Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure system-level settings and maintenance options.
          </p>
        </div>
        <Separator />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure system-level settings and maintenance options. Only administrators can access these settings.
        </p>
      </div>
      <Separator />

      <div className="space-y-6">
        {/* Maintenance Mode Card */}
        <Card className={maintenanceMode ? 'border-amber-300 bg-amber-50/30 dark:bg-amber-950/30' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Maintenance Mode
            </CardTitle>
            <CardDescription>
              Enable maintenance mode to lock out non-admin users from the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="maintenance_mode">Enable Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, only admin users can access the application
                </p>
              </div>
              <Switch
                id="maintenance_mode"
                checked={maintenanceMode}
                onCheckedChange={handleMaintenanceModeToggle}
                disabled={updateSetting.isPending}
              />
            </div>

            {maintenanceMode && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Maintenance Mode Active</AlertTitle>
                <AlertDescription>
                  Non-admin users will be redirected to the maintenance page and cannot access the application.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="maintenance_message">Maintenance Message</Label>
              <Textarea
                id="maintenance_message"
                value={maintenanceMessage}
                onChange={(e) => {
                  setMaintenanceMessage(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Enter the message to display during maintenance..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This message will be shown to users on the maintenance page.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Data Retention Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Retention
            </CardTitle>
            <CardDescription>
              Configure how long to retain audit logs and other system data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="audit_log_retention">Audit Log Retention (days)</Label>
                <p className="text-sm text-muted-foreground">
                  Number of days to keep audit log entries before cleanup
                </p>
              </div>
              <Input
                id="audit_log_retention"
                type="number"
                min={30}
                max={3650}
                value={auditLogRetentionDays}
                onChange={(e) => {
                  setAuditLogRetentionDays(parseInt(e.target.value) || 365);
                  setIsDirty(true);
                }}
                className="w-24 text-center"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Audit log cleanup functionality will be implemented in a future release.
            </p>
          </CardContent>
        </Card>

        {/* Session Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Session Settings
            </CardTitle>
            <CardDescription>
              Configure user session behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="session_timeout">Session Timeout (minutes)</Label>
                <p className="text-sm text-muted-foreground">
                  Inactive users will be logged out after this duration
                </p>
              </div>
              <Input
                id="session_timeout"
                type="number"
                min={5}
                max={1440}
                value={sessionTimeoutMinutes}
                onChange={(e) => {
                  setSessionTimeoutMinutes(parseInt(e.target.value) || 60);
                  setIsDirty(true);
                }}
                className="w-24 text-center"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Session timeout functionality will be implemented in a future release.
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSaveSettings}
            disabled={!isDirty || updateSettings.isPending}
          >
            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
