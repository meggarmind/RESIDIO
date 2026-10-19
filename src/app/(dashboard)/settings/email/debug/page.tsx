'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TestTube, Send, Loader2, Info } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useTestEmail, useSendPaymentReminders } from '@/hooks/use-email';
import { previewPaymentReminders } from '@/actions/email/send-payment-reminders';
import { ConfirmAction } from '@/components/ui/confirm-action';
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

export default function EmailDebugPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: settings, isLoading } = useSettings('email');
  const sendReminders = useSendPaymentReminders();
  const testEmailMutation = useTestEmail();
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const settingsMap = settings ? settingsToObject(settings) : {};
  const lastRun = settingsMap.email_last_reminder_run as string | null;

  const handleTestEmail = () => {
    if (testEmailAddress) {
      testEmailMutation.mutate({ email: testEmailAddress });
    }
  };

  if (isLoading) return <SettingsSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Debug & Testing</h3>
        <p className="text-sm text-muted-foreground">
          Send a test email and trigger payment reminders by hand.
        </p>
      </div>
      <Separator />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          The email debug switch moved to{' '}
          <Link href="/settings/comms-override#debug-mode" className="underline font-medium">
            Communications override &gt; Debug Mode
          </Link>
          . It now redirects every message to the override contacts, with an expiry, instead of skipping the send.
        </AlertDescription>
      </Alert>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Outside production, the test email and the payment reminders are redirected to the override contacts by the communications
          override, and are blocked if the override email is blank. In production they go to the real recipients unless Debug Mode is on.
        </AlertDescription>
      </Alert>

      {canManage && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Actions</CardTitle>
          <CardDescription>Trigger email actions manually</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Send Payment Reminders Now</Label>
              <p className="text-xs text-muted-foreground">Manually trigger reminders for all upcoming invoices</p>
              {lastRun && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last run: {new Date(lastRun).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
            <ConfirmAction
              trigger={
                <Button variant="outline" disabled={sendReminders.isPending}>
                  {sendReminders.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Send className="mr-2 h-4 w-4" /> Send Reminders
                </Button>
              }
              title="Send payment reminders now?"
              description={
                <>
                  <p>Emails go out straight away and cannot be recalled. In production they reach real residents unless Debug Mode is on; elsewhere they go to the override contacts.</p>
                  <p>Running it again the same day sends the same reminders again.</p>
                </>
              }
              confirmLabel="Send reminders"
              loadPreview={previewPaymentReminders}
              renderPreview={(preview) =>
                preview.disabledReason ? (
                  <p className="text-destructive">{preview.disabledReason}: nothing will be sent.</p>
                ) : (
                  <p>
                    <strong>{preview.invoices}</strong> reminder(s) to <strong>{preview.recipients}</strong> resident(s).
                    {preview.skipped > 0 && ` ${preview.skipped} invoice(s) skipped (no email or nothing owed).`}
                  </p>
                )
              }
              onConfirm={() => sendReminders.mutate()}
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <div>
              <Label htmlFor="test-email-address">Test Email</Label>
              <p className="text-xs text-muted-foreground">Send a test email to verify your configuration</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input id="test-email-address" type="email" placeholder="test@example.com" value={testEmailAddress} onChange={(e) => setTestEmailAddress(e.target.value)} className="max-w-xs" />
              <Button variant="outline" onClick={handleTestEmail} disabled={!testEmailAddress || testEmailMutation.isPending}>
                {testEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <TestTube className="mr-2 h-4 w-4" /> Send Test
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
