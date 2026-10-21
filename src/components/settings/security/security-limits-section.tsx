'use client';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { useResetSecuritySettings, useSecuritySettings, useUpdateSecuritySetting } from '@/hooks/use-security';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/** Contact limits. Each control writes the moment it is used, as it did on the old page, so the section is instant. */
export function SecurityLimitsSection() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_SECURITY);
  const { data: settings, isLoading } = useSecuritySettings();
  const updateSetting = useUpdateSecuritySetting();
  const resetSettings = useResetSecuritySettings();
  const [showResetDialog, setShowResetDialog] = useState(false);

  const autoExpire = settings?.auto_expire_contacts ?? true;
  const maxContacts = settings?.max_contacts_per_resident || 50;
  const warningDays = settings?.expiry_warning_days?.[0] || 7;

  const handleReset = () => {
    resetSettings.mutate(undefined, {
      onSuccess: () => {
        setShowResetDialog(false);
        toast.success('Security settings reset to defaults');
      },
    });
  };

  return (
    <>
      <SettingsSection
        id="contact-limits"
        title="Contact limits"
        summary={
          isLoading
            ? 'Loading contact limits'
            : `${autoExpire ? 'Auto-expire on' : 'Auto-expire off'}, up to ${maxContacts} contacts per category, warning ${warningDays} ${warningDays === 1 ? 'day' : 'days'} before expiry`
        }
        permissions={[PERMISSIONS.SETTINGS_MANAGE_SECURITY]}
        instant
      >
        <SettingsRow rowId="auto-expire-contacts">
          {({ controlId }) => (
            <Switch
              id={controlId}
              checked={autoExpire}
              onCheckedChange={() => updateSetting.mutate({ key: 'security_auto_expire_contacts', value: !autoExpire })}
              disabled={!canManage || isLoading || updateSetting.isPending}
            />
          )}
        </SettingsRow>
        <SettingsRow rowId="max-contacts-per-category">
          {({ controlId }) => (
            <NumericSettingInput
              id={controlId}
              min={1}
              max={100}
              integer
              value={maxContacts}
              disabled={!canManage || isLoading}
              onCommit={(value) => updateSetting.mutate({ key: 'security_max_contacts_per_resident', value })}
            />
          )}
        </SettingsRow>
        <SettingsRow rowId="expiry-warning-days">
          {({ controlId }) => (
            <NumericSettingInput
              id={controlId}
              min={1}
              max={30}
              integer
              unit="days"
              value={warningDays}
              disabled={!canManage || isLoading}
              onCommit={(value) => updateSetting.mutate({ key: 'security_expiry_warning_days', value: [value] })}
            />
          )}
        </SettingsRow>
        {canManage && (
          <SettingsRow rowId="reset-security-defaults">
            <Button variant="outline" onClick={() => setShowResetDialog(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </SettingsRow>
        )}
      </SettingsSection>

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Security Settings?</DialogTitle>
            <DialogDescription>
              This will reset all security settings to their default values. Permissions and
              contact categories will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button onClick={handleReset} disabled={resetSettings.isPending}>
              {resetSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
