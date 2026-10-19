'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Bell, FileText, UserPlus, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { getEmailStatus } from '@/actions/email/get-email-status';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function EmailSettingsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: settings, isLoading } = useSettings('email');
  const updateSetting = useUpdateSetting();
  const [isEmailConfigured, setIsEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getEmailStatus().then((status) => setIsEmailConfigured(status.isConfigured));
  }, []);

  const settingsMap = settings ? settingsToObject(settings) : {};

  const handleToggle = (key: string, currentValue: boolean) => {
    updateSetting.mutate({ key, value: !currentValue });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><h3 className="text-lg font-medium flex items-center gap-2"><Mail className="h-5 w-5" /> Email Settings</h3></div>
        <Separator />
        <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Mail className="h-5 w-5" /> Email Settings
        </h3>
        <p className="text-sm text-muted-foreground">Configure email notifications sent to residents.</p>
      </div>
      <Separator />

      {isEmailConfigured !== null && (
        <Alert variant={isEmailConfigured ? 'default' : 'destructive'}>
          {isEmailConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>
            {isEmailConfigured ? 'Email service is configured and ready to send.' : (
              <>Email service is not configured. Add <code className="text-xs">RESEND_API_KEY</code> to your environment variables.</>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Notifications</CardTitle>
          <CardDescription>Master toggle for all email notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email_enabled">Enable Email Notifications</Label>
              <p className="text-xs text-muted-foreground mt-1">When disabled, no emails will be sent from the system</p>
            </div>
            <Switch
              id="email_enabled"
              checked={settingsMap.email_enabled !== false}
              onCheckedChange={() => handleToggle('email_enabled', settingsMap.email_enabled !== false)}
              disabled={!canEdit || updateSetting.isPending || !isEmailConfigured}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Types</CardTitle>
          <CardDescription>Enable or disable specific email notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2"><Bell className="h-4 w-4 text-warning" /></div>
              <div>
                <Label htmlFor="email_payment_reminders_enabled">Payment Reminders</Label>
                <p className="text-xs text-muted-foreground">Automatic reminders before invoice due dates</p>
              </div>
            </div>
            <Switch id="email_payment_reminders_enabled" checked={settingsMap.email_payment_reminders_enabled !== false} onCheckedChange={() => handleToggle('email_payment_reminders_enabled', settingsMap.email_payment_reminders_enabled !== false)} disabled={!canEdit || updateSetting.isPending} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-info/10 p-2"><FileText className="h-4 w-4 text-info" /></div>
              <div>
                <Label htmlFor="email_invoice_notifications_enabled">Invoice Notifications</Label>
                <p className="text-xs text-muted-foreground">Send email when a new invoice is generated</p>
              </div>
            </div>
            <Switch id="email_invoice_notifications_enabled" checked={settingsMap.email_invoice_notifications_enabled !== false} onCheckedChange={() => handleToggle('email_invoice_notifications_enabled', settingsMap.email_invoice_notifications_enabled !== false)} disabled={!canEdit || updateSetting.isPending} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2"><UserPlus className="h-4 w-4 text-success" /></div>
              <div>
                <Label htmlFor="email_welcome_enabled">Welcome Emails</Label>
                <p className="text-xs text-muted-foreground">Send welcome email to new residents with their code</p>
              </div>
            </div>
            <Switch id="email_welcome_enabled" checked={settingsMap.email_welcome_enabled !== false} onCheckedChange={() => handleToggle('email_welcome_enabled', settingsMap.email_welcome_enabled !== false)} disabled={!canEdit || updateSetting.isPending} />
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Payment reminders run automatically every day at 8 AM via Vercel Cron. Configure which days to send reminders in{' '}
          <a href="/settings/billing" className="text-primary underline">Billing Settings</a>.
        </AlertDescription>
      </Alert>
    </div>
  );
}
