'use client';

import { useState } from 'react';
import { CurrencyInput } from '@/components/ui/currency-input';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSkeleton } from '@/components/settings/settings-states';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  EMAIL_AUTO_PROCESS_LIMIT_KEY,
  EMAIL_AUTO_PROCESS_LIMIT_NGN,
  isValidEmailAutoProcessLimit,
} from '@/lib/email-imports/utils';

/**
 * The email-import auto-process limit (#710), moved here from Gmail Import (#1274) because it decides
 * which matched payments wait for approval. Same key and same rule as before: saving goes through
 * updateSetting, which for this key needs settings.manage_general and the super_admin role (owner
 * decision), so the control is gated on both. The section shows for whoever the Banking page admits. settings.manage_billing
 * admits the financial officer, who sees the limit read-only and cannot save it (#1283).
 */
export function ApprovalLimitSection() {
  const { hasPermission, profile } = useAuth();
  const canEdit =
    hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL) && profile?.role_name === 'super_admin';
  const { data: settings, isLoading } = useSettings('email_integration');
  const updateSetting = useUpdateSetting();
  const [draft, setDraft] = useState<number | null>(null);

  const stored = settings?.find((s) => s.key === EMAIL_AUTO_PROCESS_LIMIT_KEY)?.value;
  const current = stored === undefined ? EMAIL_AUTO_PROCESS_LIMIT_NGN : Number(stored);
  const isDirty = draft !== null && draft !== current;
  const valid = draft === null || isValidEmailAutoProcessLimit(draft);

  const save = async () => {
    try {
      await updateSetting.mutateAsync({ key: EMAIL_AUTO_PROCESS_LIMIT_KEY, value: String(draft) });
      setDraft(null);
      return true;
    } catch {
      // The mutation has already toasted the error; the draft stays so nothing typed is lost.
      return false;
    }
  };

  return (
    <SettingsSection
      id="approval-limit"
      title="Approval limit"
      summary={isLoading ? 'Loading' : `Auto-matched payments above ₦${current.toLocaleString()} wait for approval`}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_REFERENCE, PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE, PERMISSIONS.SETTINGS_MANAGE_BILLING]}
      isDirty={isDirty}
      isSaving={updateSetting.isPending}
      canSave={canEdit && valid}
      saveBlockedReason={canEdit ? 'Enter a valid amount before saving.' : 'Only a super admin can change this limit.'}
      onSave={save}
      onDiscard={() => setDraft(null)}
    >
      <SettingsRow rowId="email-auto-process-limit">
        {({ controlId }) =>
          isLoading ? (
            <SettingsSkeleton rows={1} className="w-40" />
          ) : (
            <CurrencyInput
              id={controlId}
              value={draft ?? current}
              onValueChange={setDraft}
              allowDecimals={false}
              className="w-48 text-right"
              disabled={!canEdit || updateSetting.isPending}
            />
          )
        }
      </SettingsRow>
    </SettingsSection>
  );
}
