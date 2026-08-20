'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TestTube, Send, Loader2, Info, AlertCircle } from 'lucide-react';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { useTestEmail, useSendPaymentReminders } from '@/hooks/use-email';
import { toast } from 'sonner';

function settingsToObject(settings: { key: string; value: unknown }[] | undefined): Record<string, unknown> {
  if (!settings) return {};
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, unknown>);
}

export default function EmailDebugPage() {
  const { data: settings, isLoading } = useSettings('email');
  const updateSetting = useUpdateSetting();
  const sendReminders = useSendPaymentReminders();
  const testEmailMutation = useTestEmail();
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const settingsMap = settings ? settingsToObject(settings) : {};

  const isDebugMode = settingsMap.email_debug_mode === 'true' || settingsMap.email_debug_mode === true;
  const lastRun = settingsMap.email_last_reminder_run as string | null;

  const handleDebugModeToggle = async () => {
    updateSetting.mutate({ key: 'email_debug_mode', value: !isDebugMode });
    toast.success(`Debug mode ${!isDebugMode ? 'enabled' : 'disabled'}`);
  };

  const handleTestEmail = () => {
    if (testEmailAddress) {
      testEmailMutation.mutate({ email: testEmailAddress });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Debug & Testing</h3>
        <p className="text-sm text-muted-foreground">
          Test email functionality and manage debug mode.
        </p>
      </div>
      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Email Debug Mode
          </CardTitle>
          <CardDescription>Test email functionality without sending to actual recipients</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Debug Mode</Label>
              <p className="text-xs text-muted-foreground mt-1">Emails will be logged but NOT sent to residents</p>
            </div>
            <Switch checked={isDebugMode} onCheckedChange={handleDebugModeToggle} disabled={updateSetting.isPending} />
          </div>
          {isDebugMode && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Debug Mode Active:</strong> All emails are being logged to the database but are NOT being sent to recipients.
              </AlertDescription>
            </Alert>
          )}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              When debug mode is enabled, emails are saved to the email logs with status &quot;DEBUG_MODE&quot; and include the original recipient in metadata.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

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
            <Button variant="outline" onClick={() => sendReminders.mutate()} disabled={sendReminders.isPending}>
              {sendReminders.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Send Reminders
            </Button>
          </div>
          <Separator />
          <div className="space-y-3">
            <div>
              <Label>Test Email</Label>
              <p className="text-xs text-muted-foreground">Send a test email to verify your configuration</p>
            </div>
            <div className="flex gap-2">
              <Input type="email" placeholder="test@example.com" value={testEmailAddress} onChange={(e) => setTestEmailAddress(e.target.value)} className="max-w-xs" />
              <Button variant="outline" onClick={handleTestEmail} disabled={!testEmailAddress || testEmailMutation.isPending}>
                {testEmailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <TestTube className="mr-2 h-4 w-4" /> Send Test
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
