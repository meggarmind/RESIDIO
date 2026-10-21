'use client';

import { useCallback, useMemo, useState } from 'react';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { useSystemSettings, useUpdateSettings } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const DEFAULT_TIMEOUT_MINUTES = 60;

/** Session timeout. Moved from Maintenance (#937); it is still written by updateSettings under system.manage_maintenance. */
export function SessionTimeoutSection() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();

  const saved = useMemo(
    () => Number(systemSettings?.find((setting) => setting.key === 'session_timeout_minutes')?.value) || DEFAULT_TIMEOUT_MINUTES,
    [systemSettings],
  );
  const [draft, setDraft] = useState<number | null>(null);
  const [valid, setValid] = useState(true);
  // Remounts the field on Discard so its typed draft and message reset too.
  const [resetKey, setResetKey] = useState(0);

  const value = draft ?? saved;
  const isDirty = draft !== null && draft !== saved;
  const onValidityChange = useCallback((ok: boolean) => setValid(ok), []);

  const onSave = async () => {
    try {
      await updateSettings.mutateAsync({ session_timeout_minutes: value });
      setDraft(null);
      return true;
    } catch {
      // The mutation already toasted the error.
      return false;
    }
  };

  return (
    <SettingsSection
      id="session-timeout"
      title="Session timeout"
      summary={isLoading ? 'Loading session timeout' : `Signed out after ${saved} minutes of inactivity`}
      permissions={[PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]}
      isDirty={isDirty || !valid}
      isSaving={updateSettings.isPending}
      canSave={valid && isDirty}
      saveBlockedReason={valid ? undefined : 'Enter a whole number of minutes from 5 to 1,440 to save.'}
      onSave={onSave}
      onDiscard={() => {
        setDraft(null);
        setValid(true);
        setResetKey((k) => k + 1);
      }}
    >
      <SettingsRow rowId="session-timeout-minutes">
        {({ controlId }) => (
          <NumericSettingInput
            key={resetKey}
            id={controlId}
            min={5}
            max={1440}
            integer
            unit="min"
            value={value}
            onCommit={setDraft}
            onValidityChange={onValidityChange}
            disabled={!canEdit}
          />
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
