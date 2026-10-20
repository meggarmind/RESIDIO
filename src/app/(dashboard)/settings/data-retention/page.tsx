'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemSettings, useUpdateSettings } from '@/hooks/use-settings';
import { pruneSystemData, previewPruneSystemData } from '@/actions/system/prune-data';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { NumericSettingInput } from '@/components/settings/numeric-setting-input';
import {
  AUDIT_LOG_RETENTION_DEFAULT_DAYS,
  AUDIT_LOG_RETENTION_MAX_DAYS,
  AUDIT_LOG_RETENTION_MIN_DAYS,
} from '@/lib/validators/setting-value';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsSkeleton } from '@/components/settings/settings-states';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function DataRetentionPage() {
  const { hasPermission } = useAuth();
  // Both the retention rule (updateSettings) and the prune enforce system.manage_data_retention.
  const canEditRetention = hasPermission(PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION);
  const canPrune = canEditRetention;
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();

  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState(AUDIT_LOG_RETENTION_DEFAULT_DAYS);
  const [isDirty, setIsDirty] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [retentionValid, setRetentionValid] = useState(true);

  useEffect(() => {
    if (systemSettings) {
      const settingsObj = settingsToObject(systemSettings);
      setAuditLogRetentionDays(Number(settingsObj.audit_log_retention_days) || AUDIT_LOG_RETENTION_DEFAULT_DAYS);
      setIsDirty(false);
    }
  }, [systemSettings]);

  const handleSaveSettings = () => {
    updateSettings.mutate({ audit_log_retention_days: auditLogRetentionDays }, {
      onSuccess: () => setIsDirty(false),
    });
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

  if (isLoading) return <SettingsSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Data & Retention</h3>
        <p className="text-sm text-muted-foreground">
          Configure data retention policies and manage storage cleanup.
        </p>
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Retention
          </CardTitle>
          <CardDescription>Configure how long to retain audit logs and other system data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="audit-log-retention">Audit Log Retention (days)</Label>
              <p className="text-sm text-muted-foreground">Prune Data below deletes audit log entries older than this. Saved changes apply to the next prune.</p>
            </div>
            <NumericSettingInput
              id="audit-log-retention"
              min={AUDIT_LOG_RETENTION_MIN_DAYS}
              max={AUDIT_LOG_RETENTION_MAX_DAYS}
              integer
              unit="days"
              value={auditLogRetentionDays}
              onCommit={(value) => { setAuditLogRetentionDays(value); setIsDirty(true); }}
              onValidityChange={setRetentionValid}
              disabled={!canEditRetention}
            />
          </div>
          {canEditRetention && (
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={!isDirty || !retentionValid || updateSettings.isPending}>
              {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </div>
          )}
        </CardContent>
      </Card>

      {canPrune && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>Manage system data storage and cleanup.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Prune Old Data</Label>
              <p className="text-sm text-muted-foreground">
                Remove old notifications ({'>'}30 days read, {'>'}90 days unread), audit logs (older than the Audit Log Retention setting), search history ({'>'}30 days), and system action log entries ({'>'}90 days).
              </p>
            </div>
            <ConfirmAction
              trigger={
                <Button variant="outline" disabled={isPruning} className="text-destructive hover:text-destructive hover:bg-destructive/10">
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
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
