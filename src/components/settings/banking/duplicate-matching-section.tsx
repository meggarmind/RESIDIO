'use client';

import { useState } from 'react';
import { useSystemSettings, useUpdateSettings } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';

const DEFAULT_THRESHOLD = 90;

/**
 * Duplicate matching of Banking (moved from the Maintenance page, #935). The threshold is a draft until
 * the section's Save, as it was behind the Maintenance page's bar, and keeps system.manage_maintenance.
 */
export function DuplicateMatchingSection() {
  const { hasPermission } = useAuth();
  // updateSettings enforces system.manage_maintenance for this key.
  const canEdit = hasPermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();

  const saved = Number(systemSettings?.find((setting) => setting.key === 'duplicate_matching_threshold')?.value) || DEFAULT_THRESHOLD;
  const [draft, setDraft] = useState<number | null>(null);
  const [valid, setValid] = useState(true);
  // Remounts the field on Discard so its typed draft and message reset too.
  const [resetKey, setResetKey] = useState(0);
  const isDirty = draft !== null && draft !== saved;

  const save = async () => {
    try {
      await updateSettings.mutateAsync({ duplicate_matching_threshold: draft });
      setDraft(null);
      return true;
    } catch {
      // The mutation has already toasted the error; the draft stays so nothing typed is lost.
      return false;
    }
  };

  const discard = () => {
    setDraft(null);
    setValid(true);
    setResetKey((key) => key + 1);
  };

  return (
    <SettingsSection
      id="duplicate-matching"
      title="Duplicate matching"
      summary={isLoading ? 'Loading' : `Flags transactions that score above ${saved}%`}
      permissions={[PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]}
      isDirty={isDirty}
      isSaving={updateSettings.isPending}
      canSave={valid}
      saveBlockedReason="Fix the threshold before saving."
      onSave={save}
      onDiscard={discard}
    >
      <SettingsRow rowId="duplicate-threshold">
        {({ controlId }) =>
          isLoading ? (
            <SettingsSkeleton rows={1} className="w-40" />
          ) : (
            <NumericSettingInput
              key={`threshold-${resetKey}`}
              id={controlId}
              min={1}
              max={100}
              integer
              unit="%"
              value={draft ?? saved}
              onCommit={setDraft}
              onValidityChange={setValid}
              disabled={!canEdit}
            />
          )
        }
      </SettingsRow>
    </SettingsSection>
  );
}
