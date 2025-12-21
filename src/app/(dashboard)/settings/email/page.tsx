'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Mail,
  Send,
  Bell,
  FileText,
  UserPlus,
  TestTube,
  Loader2,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useTestEmail, useSendPaymentReminders } from '@/hooks/use-email';
import { getEmailStatus } from '@/actions/email/get-email-status';

export default function EmailSettingsPage() {
  const { data: settings, isLoading } = useSettings('email');
  const updateSetting = useUpdateSetting();
  const sendReminders = useSendPaymentReminders();
  const testEmailMutation = useTestEmail();
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isEmailConfigured, setIsEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getEmailStatus().then((status) => setIsEmailConfigured(status.isConfigured));
  }, []);

  const settingsMap =
    settings?.reduce(
      (acc, s) => {
        let value = s.value;
        if (typeof value === 'string') {
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
        }
        acc[s.key] = value;
        return acc;
      },
      {} as Record<string, unknown>
    ) || {};

  const handleToggle = (key: string, currentValue: boolean) => {
    updateSetting.mutate({ key, value: !currentValue });
  };

  const handleTestEmail = () => {
    if (testEmailAddress) {
      testEmailMutation.mutate({ email: testEmailAddress });
    }
  };

  const lastRun = settingsMap.email_last_reminder_run as string | null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Settings
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure email notifications sent to residents.
          </p>
        </div>
        <Separator />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Settings
        </h3>
        <p className="text-sm text-muted-foreground">
          Configure email notifications sent to residents.
        </p>
      </div>
      <Separator />

      {/* Configuration Status */}
      {isEmailConfigured !== null && (
        <Alert variant={isEmailConfigured ? 'default' : 'destructive'}>
          {isEmailConfigured ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>
            {isEmailConfigured ? (
              'Email service is configured and ready to send.'
            ) : (
              <>
                Email service is not configured. Add <code className="text-xs">RESEND_API_KEY</code>{' '}
                to your environment variables to enable email sending.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Master Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Notifications</CardTitle>
          <CardDescription>Master toggle for all email notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email_enabled">Enable Email Notifications</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When disabled, no emails will be sent from the system
              </p>
            </div>
            <Switch
              id="email_enabled"
              checked={settingsMap.email_enabled !== false}
              onCheckedChange={() =>
                handleToggle('email_enabled', settingsMap.email_enabled !== false)
              }
              disabled={updateSetting.isPending || !isEmailConfigured}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Types</CardTitle>
          <CardDescription>Enable or disable specific email notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payment Reminders */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <Bell className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <Label>Payment Reminders</Label>
                <p className="text-xs text-muted-foreground">
                  Automatic reminders before invoice due dates
                </p>
              </div>
            </div>
            <Switch
              checked={settingsMap.email_payment_reminders_enabled !== false}
              onCheckedChange={() =>
                handleToggle(
                  'email_payment_reminders_enabled',
                  settingsMap.email_payment_reminders_enabled !== false
                )
              }
              disabled={updateSetting.isPending}
            />
          </div>

          <Separator />

          {/* Invoice Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <Label>Invoice Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Send email when a new invoice is generated
                </p>
              </div>
            </div>
            <Switch
              checked={settingsMap.email_invoice_notifications_enabled !== false}
              onCheckedChange={() =>
                handleToggle(
                  'email_invoice_notifications_enabled',
                  settingsMap.email_invoice_notifications_enabled !== false
                )
              }
              disabled={updateSetting.isPending}
            />
          </div>

          <Separator />

          {/* Welcome Emails */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <UserPlus className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <Label>Welcome Emails</Label>
                <p className="text-xs text-muted-foreground">
                  Send welcome email to new residents with their code
                </p>
              </div>
            </div>
            <Switch
              checked={settingsMap.email_welcome_enabled !== false}
              onCheckedChange={() =>
                handleToggle('email_welcome_enabled', settingsMap.email_welcome_enabled !== false)
              }
              disabled={updateSetting.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Manual Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Actions</CardTitle>
          <CardDescription>Trigger email actions manually</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Send Reminders Now */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Send Payment Reminders Now</Label>
              <p className="text-xs text-muted-foreground">
                Manually trigger reminders for all upcoming invoices
              </p>
              {lastRun && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last run:{' '}
                  {new Date(lastRun).toLocaleString('en-NG', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => sendReminders.mutate()}
              disabled={sendReminders.isPending}
            >
              {sendReminders.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" />
              Send Reminders
            </Button>
          </div>

          <Separator />

          {/* Test Email */}
          <div className="space-y-3">
            <div>
              <Label>Test Email</Label>
              <p className="text-xs text-muted-foreground">
                Send a test email to verify your configuration
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="test@example.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                className="max-w-xs"
              />
              <Button
                variant="outline"
                onClick={handleTestEmail}
                disabled={!testEmailAddress || testEmailMutation.isPending}
              >
                {testEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <TestTube className="mr-2 h-4 w-4" />
                Send Test
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Payment reminders run automatically every day at 8 AM via Vercel Cron. Configure which
          days to send reminders in{' '}
          <a href="/settings/billing" className="text-primary underline">
            Billing Settings
          </a>
          .
        </AlertDescription>
      </Alert>
    </div>
  );
}
