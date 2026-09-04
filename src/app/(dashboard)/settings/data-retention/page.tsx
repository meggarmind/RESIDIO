'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSystemSettings, useUpdateSettings } from '@/hooks/use-settings';
import { pruneSystemData } from '@/actions/system/prune-data';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function DataRetentionPage() {
  const { data: systemSettings, isLoading } = useSystemSettings();
  const updateSettings = useUpdateSettings();

  const [auditLogRetentionDays, setAuditLogRetentionDays] = useState(365);
  const [isDirty, setIsDirty] = useState(false);
  const [isPruning, setIsPruning] = useState(false);

  useEffect(() => {
    if (systemSettings) {
      const settingsObj = settingsToObject(systemSettings);
      setAuditLogRetentionDays(Number(settingsObj.audit_log_retention_days) || 365);
      setIsDirty(false);
    }
  }, [systemSettings]);

  const handleSaveSettings = () => {
    updateSettings.mutate({ audit_log_retention_days: auditLogRetentionDays }, {
      onSuccess: () => setIsDirty(false),
    });
  };

  const handlePruneData = async () => {
    setIsPruning(true);
    try {
      const result = await pruneSystemData();
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        toast.success(`Pruned ${result.data.notifications} notifications, ${result.data.auditLogs} audit logs, and ${result.data.searchLogs} search logs.`);
      }
    } catch {
      toast.error('Failed to prune data');
    } finally {
      setIsPruning(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

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
              <Label>Audit Log Retention (days)</Label>
              <p className="text-sm text-muted-foreground">Number of days to keep audit log entries before cleanup</p>
            </div>
            <Input
              type="number" min={30} max={3650}
              value={auditLogRetentionDays}
              onChange={(e) => { setAuditLogRetentionDays(parseInt(e.target.value) || 365); setIsDirty(true); }}
              className="w-24 text-center"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Note: Audit log cleanup functionality will be implemented in a future release.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={!isDirty || updateSettings.isPending}>
              {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>

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
                Remove old notifications ({'>'}30 days read, {'>'}90 days unread), audit logs ({'>'}6 months), and search history ({'>'}30 days).
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <Trash2 className="mr-2 h-4 w-4" /> Prune Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete old notifications, audit logs, and search history from the database.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePruneData} className="bg-red-600 hover:bg-red-700 text-white">
                    {isPruning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Yes, Prune Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
