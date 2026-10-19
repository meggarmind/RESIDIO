'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemSettings, useUpdateSettings } from '@/hooks/use-settings';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { updateMaintenanceMode, previewMaintenanceLockout } from '@/actions/settings/update-maintenance-mode';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { StickySaveBar } from '@/components/settings/sticky-save-bar';
import { isMaintenanceModeOn } from '@/lib/settings/maintenance-mode';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';

const DEFAULT_MESSAGE = 'The system is currently under maintenance. Please try again later.';

type MaintenanceForm = {
  maintenance_message: string;
  session_timeout_minutes: number;
  duplicate_matching_threshold: number;
};

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  // The switch enforces system.manage_maintenance; the saved fields go through
  // updateSettings, which enforces settings.manage_general.
  const canToggle = hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  const canEdit = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();

  const settingsObj = useMemo(() => settingsToObject(systemSettings), [systemSettings]);
  const savedForm = useMemo<MaintenanceForm>(() => ({
    maintenance_message: (settingsObj.maintenance_message as string) || DEFAULT_MESSAGE,
    session_timeout_minutes: Number(settingsObj.session_timeout_minutes) || 60,
    duplicate_matching_threshold: Number(settingsObj.duplicate_matching_threshold) || 90,
  }), [settingsObj]);
  // The stored value may be a boolean or the string 'true' (updateSetting stores strings).
  const maintenanceMode = isMaintenanceModeOn(settingsObj.maintenance_mode);

  // One save model: every field below is a draft until Save. Maintenance mode itself is an
  // action with its own confirmation, not part of the draft.
  const [overrides, setOverrides] = useState<Partial<MaintenanceForm>>({});
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Remounts the numeric fields on Discard so their drafts and messages reset too.
  const [resetKey, setResetKey] = useState(0);

  const form = { ...savedForm, ...overrides };
  const isDirty = Object.keys(overrides).length > 0;
  const canSave = !Object.values(invalidFields).some(Boolean);
  useUnsavedChangesGuard(isDirty);

  const setField = <K extends keyof MaintenanceForm>(key: K, value: MaintenanceForm[K]) =>
    setOverrides((prev) => ({ ...prev, [key]: value }));
  const trackValidity = useCallback(
    (key: string) => (valid: boolean) => setInvalidFields((prev) => (prev[key] === !valid ? prev : { ...prev, [key]: !valid })),
    []
  );
  const timeoutValidity = useMemo(() => trackValidity('session_timeout_minutes'), [trackValidity]);
  const thresholdValidity = useMemo(() => trackValidity('duplicate_matching_threshold'), [trackValidity]);

  const setMaintenanceMode = async (enabled: boolean) => {
    setSwitching(true);
    try {
      // The message shown is the saved one; unsaved edits are not sent with the switch.
      const result = await updateMaintenanceMode(enabled);
      if (!result.success) {
        toast.error(result.error || 'Failed to update maintenance mode');
        throw new Error(result.error);
      }
      toast.success(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    } finally {
      setSwitching(false);
    }
  };

  const handleSave = () => {
    updateSettings.mutate(overrides, { onSuccess: () => setOverrides({}) });
  };

  if (isLoading) return <SettingsSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Maintenance Mode</h3>
        <p className="text-sm text-muted-foreground">
          Control maintenance mode and system access settings.
        </p>
      </div>
      <Separator />

      <Card className={maintenanceMode ? 'border-warning/40 bg-warning/5' : ''}>
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
              <Label htmlFor="maintenance-mode">Enable Maintenance Mode</Label>
              <p className="text-sm text-muted-foreground">Only super admins can use the application. Takes effect as soon as you confirm.</p>
            </div>
            <Switch
              id="maintenance-mode"
              checked={maintenanceMode}
              onCheckedChange={(checked) => (checked ? setConfirmOpen(true) : setMaintenanceMode(false).catch(() => {}))}
              disabled={!canToggle || switching}
            />
          </div>
          <ConfirmAction
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Turn on maintenance mode?"
            description={
              <>
                <p>Everyone signed in without the super admin role is sent to the maintenance page on their next page load, until maintenance mode is turned off again.</p>
                <p>They will see: &ldquo;{savedForm.maintenance_message}&rdquo;</p>
                {overrides.maintenance_message !== undefined && (
                  <p>Your unsaved message edits are not used. Save them first to show them.</p>
                )}
              </>
            }
            confirmLabel="Turn on maintenance mode"
            destructive
            loadPreview={previewMaintenanceLockout}
            renderPreview={(preview) => (
              <div className="space-y-1">
                <p><strong>{preview.total}</strong> active account(s) will be locked out:</p>
                <ul className="list-disc pl-5">
                  {preview.byRole.map((r) => <li key={r.role}>{r.role}: {r.count}</li>)}
                </ul>
              </div>
            )}
            onConfirm={() => setMaintenanceMode(true)}
          />
          {maintenanceMode && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Maintenance Mode Active</AlertTitle>
              <AlertDescription>Non-admin users will be redirected to the maintenance page.</AlertDescription>
            </Alert>
          )}
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="maintenance-message">Maintenance Message</Label>
            <Textarea
              id="maintenance-message"
              value={form.maintenance_message}
              onChange={(e) => setField('maintenance_message', e.target.value)}
              placeholder="Enter the message to display during maintenance..."
              rows={3}
              disabled={!canEdit}
              aria-describedby="maintenance-message-help"
            />
            <p id="maintenance-message-help" className="text-xs text-muted-foreground">This message will be shown to users on the maintenance page once saved.</p>
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
              <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
              <p className="text-sm text-muted-foreground">Inactive users will be logged out after this duration</p>
            </div>
            <NumericSettingInput
              key={`timeout-${resetKey}`}
              id="session-timeout"
              min={5}
              max={1440}
              integer
              unit="min"
              value={form.session_timeout_minutes}
              onCommit={(value) => setField('session_timeout_minutes', value)}
              onValidityChange={timeoutValidity}
              disabled={!canEdit}
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
              <Label htmlFor="duplicate-threshold">Confidence Threshold (%)</Label>
              <p className="text-sm text-muted-foreground">Transactions above this score will be flagged as duplicates</p>
            </div>
            <NumericSettingInput
              key={`threshold-${resetKey}`}
              id="duplicate-threshold"
              min={1}
              max={100}
              integer
              unit="%"
              value={form.duplicate_matching_threshold}
              onCommit={(value) => setField('duplicate_matching_threshold', value)}
              onValidityChange={thresholdValidity}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <StickySaveBar
          isDirty={isDirty || !canSave}
          isSaving={updateSettings.isPending}
          canSave={canSave && isDirty}
          onSave={handleSave}
          onDiscard={() => { setOverrides({}); setInvalidFields({}); setResetKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
