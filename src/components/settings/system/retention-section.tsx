'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import { pruneSystemData, previewPruneSystemData } from '@/actions/system/prune-data';
import { useUpdateSettings } from '@/hooks/use-settings';
import {
  AUDIT_LOG_RETENTION_DEFAULT_DAYS,
  AUDIT_LOG_RETENTION_MAX_DAYS,
  AUDIT_LOG_RETENTION_MIN_DAYS,
} from '@/lib/validators/setting-value';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { useSystemSettingValues } from '@/components/settings/system/use-system-setting-values';

/**
 * Audit log retention and the Prune action that runs it. Prune stays beside the rule it enforces
 * (ADR-0004); it acts at once, behind a typed confirmation, while the retention days are a draft
 * until Save.
 */
export function RetentionSection() {
  const { hasPermission } = useAuth();
  // Both the retention rule (updateSettings) and the prune enforce system.manage_data_retention.
  const canEdit = hasPermission(PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION);
  const { values, isLoading } = useSystemSettingValues();
  const updateSettings = useUpdateSettings();

  const savedDays = Number(values.audit_log_retention_days) || AUDIT_LOG_RETENTION_DEFAULT_DAYS;
  const [draft, setDraft] = useState<number>();
  const [valid, setValid] = useState(true);
  const [isPruning, setIsPruning] = useState(false);
  // Remounts the field on Discard so its typed draft and message reset too.
  const [resetKey, setResetKey] = useState(0);
  const days = draft ?? savedDays;
  const isDirty = (draft !== undefined && draft !== savedDays) || !valid;

  const save = async () => {
    await updateSettings.mutateAsync({ audit_log_retention_days: days });
    setDraft(undefined);
  };

  // Throws on failure so the confirmation stays open.
  const handlePruneData = async () => {
    setIsPruning(true);
    try {
      const result = await pruneSystemData().catch(() => ({ data: null, error: 'Failed to prune data' }));
      if (result.error || !result.data) {
        toast.error(result.error || 'Failed to prune data');
        throw new Error(result.error || 'Failed to prune data');
      }
      toast.success(`Pruned ${result.data.notifications} notifications, ${result.data.auditLogs} audit logs, ${result.data.searchLogs} search logs, and ${result.data.systemActionLogs} system action log entries.`);
    } finally {
      setIsPruning(false);
    }
  };

  return (
    <SettingsSection
      id="retention"
      title="Data retention"
      summary={isLoading ? 'Loading' : `Audit logs kept ${savedDays} days`}
      permissions={[PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION]}
      defaultCollapsed
      isDirty={isDirty}
      isSaving={updateSettings.isPending}
      canSave={valid}
      saveBlockedReason={`Enter a whole number of days from ${AUDIT_LOG_RETENTION_MIN_DAYS} to ${AUDIT_LOG_RETENTION_MAX_DAYS}.`}
      onSave={save}
      onDiscard={() => { setDraft(undefined); setValid(true); setResetKey((k) => k + 1); }}
    >
      <SettingsRow rowId="audit-log-retention">
        {({ controlId }) => (
          <NumericSettingInput
            key={resetKey}
            id={controlId}
            min={AUDIT_LOG_RETENTION_MIN_DAYS}
            max={AUDIT_LOG_RETENTION_MAX_DAYS}
            integer
            unit="days"
            value={days}
            onCommit={setDraft}
            onValidityChange={setValid}
            disabled={!canEdit || isLoading}
          />
        )}
      </SettingsRow>

      <SettingsRow rowId="prune-data">
        <ConfirmAction
          trigger={
            <Button variant="outline" disabled={!canEdit || isPruning} className="text-destructive hover:text-destructive hover:bg-destructive/10">
              {isPruning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Prune Data
            </Button>
          }
          title="Permanently delete old data?"
          description={
            <>
              <p>This cannot be undone. Rows are deleted from the database: read notifications over 30 days, unread over 90 days, audit logs older than the saved Audit Log Retention setting, search history over 30 days, system action log over 90 days.</p>
              <p>Deleted audit logs remove the record of who changed what.</p>
            </>
          }
          confirmLabel="Delete permanently"
          destructive
          confirmWord="PRUNE"
          loadPreview={previewPruneSystemData}
          renderPreview={(preview) => (
            <ul className="space-y-1">
              <li><strong>{preview.auditLogs}</strong> audit log entries (older than {preview.auditLogRetentionDays} days)</li>
              <li><strong>{preview.notifications}</strong> notifications</li>
              <li><strong>{preview.searchLogs}</strong> search history entries</li>
              <li><strong>{preview.systemActionLogs}</strong> system action log entries</li>
            </ul>
          )}
          onConfirm={handlePruneData}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
