'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { updateMaintenanceMode, previewMaintenanceLockout } from '@/actions/settings/update-maintenance-mode';
import { useUpdateSettings } from '@/hooks/use-settings';
import { isMaintenanceModeOn } from '@/lib/settings/maintenance-mode';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { useSystemSettingValues } from '@/components/settings/system/use-system-setting-values';

const DEFAULT_MESSAGE = 'The system is currently under maintenance. Please try again later.';

/**
 * Maintenance mode and the message shown during it. The switch acts at once, behind a confirmation
 * that previews who is locked out; the message is a draft until Save. The section carries the
 * warning state while the mode is on.
 */
export function MaintenanceModeSection() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  // The switch and the saved message (updateSettings) both enforce system.manage_maintenance.
  const canEdit = hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  const { values, isLoading } = useSystemSettingValues();
  const updateSettings = useUpdateSettings();

  const savedMessage = (values.maintenance_message as string) || DEFAULT_MESSAGE;
  // The stored value may be a boolean or the string 'true' (updateSetting stores strings).
  const maintenanceMode = isMaintenanceModeOn(values.maintenance_mode);

  const [draft, setDraft] = useState<string>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const message = draft ?? savedMessage;
  const isDirty = draft !== undefined && draft !== savedMessage;

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

  const save = async () => {
    await updateSettings.mutateAsync({ maintenance_message: message });
    setDraft(undefined);
  };

  const summary = isLoading
    ? 'Loading'
    : maintenanceMode
      ? 'On. Everyone except super admins is locked out.'
      : 'Off';

  return (
    <SettingsSection
      id="maintenance-mode"
      title="Maintenance mode"
      summary={summary}
      permissions={[PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]}
      warning={maintenanceMode}
      isDirty={isDirty}
      isSaving={updateSettings.isPending}
      onSave={save}
      onDiscard={() => setDraft(undefined)}
    >
      {maintenanceMode && (
        <div className="px-4 pt-4 md:px-5">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Maintenance mode is active</AlertTitle>
            <AlertDescription>Non-admin users are redirected to the maintenance page.</AlertDescription>
          </Alert>
        </div>
      )}

      <SettingsRow rowId="maintenance-mode">
        {({ controlId }) => (
          <Switch
            id={controlId}
            checked={maintenanceMode}
            onCheckedChange={(checked) => (checked ? setConfirmOpen(true) : setMaintenanceMode(false).catch(() => {}))}
            disabled={!canEdit || isLoading || switching}
          />
        )}
      </SettingsRow>
      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Turn on maintenance mode?"
        description={
          <>
            <p>Everyone signed in without the super admin role is sent to the maintenance page on their next page load, until maintenance mode is turned off again.</p>
            <p>They will see: &ldquo;{savedMessage}&rdquo;</p>
            {isDirty && <p>Your unsaved message edits are not used. Save them first to show them.</p>}
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

      <SettingsRow rowId="maintenance-message" stacked>
        {({ controlId, helpId }) => (
          <Textarea
            id={controlId}
            value={message}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter the message to display during maintenance..."
            rows={3}
            disabled={!canEdit || isLoading}
            aria-describedby={helpId}
            className="max-w-xl"
          />
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
