'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useSettings, useUpdateSetting } from '@/hooks/use-settings';
import { getEmailStatus } from '@/actions/email/get-email-status';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

const TYPE_ROWS = [
  { rowId: 'email-payment-reminders', key: 'email_payment_reminders_enabled' },
  { rowId: 'email-invoice-notifications', key: 'email_invoice_notifications_enabled' },
  { rowId: 'email-welcome', key: 'email_welcome_enabled' },
] as const;

/** Channels and Email types of /settings/sending (from the old Email Settings page). */
export function EmailDeliverySections() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  const { data: settings, isLoading } = useSettings('email');
  const updateSetting = useUpdateSetting();
  const [isEmailConfigured, setIsEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    getEmailStatus().then((status) => setIsEmailConfigured(status.isConfigured));
  }, []);

  // A missing value means on, as it always has.
  const isOn = (key: string) => settings?.find((setting) => setting.key === key)?.value !== false;
  const toggle = (key: string) => updateSetting.mutate({ key, value: !isOn(key) });
  const busy = !canEdit || updateSetting.isPending || isLoading;

  const channelSummary =
    isEmailConfigured === false
      ? 'Not configured on the server'
      : isLoading
        ? 'Loading'
        : isOn('email_enabled')
          ? 'Email is on'
          : 'Email is off';
  const typeSummary = isLoading
    ? 'Loading'
    : `${TYPE_ROWS.filter((row) => isOn(row.key)).length} of ${TYPE_ROWS.length} on`;

  return (
    <>
      <SettingsSection
        id="channels"
        title="Channels"
        summary={channelSummary}
        permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
        instant
      >
        {isEmailConfigured !== null && (
          <div className="px-4 pt-4 md:px-5">
            <Alert variant={isEmailConfigured ? 'default' : 'destructive'}>
              {isEmailConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>
                {isEmailConfigured ? (
                  'Email service is configured and ready to send.'
                ) : (
                  <>
                    Email service is not configured. Add <code className="text-xs">RESEND_API_KEY</code> to your environment variables.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
        <SettingsRow rowId="email-enabled">
          {({ controlId }) => (
            <Switch
              id={controlId}
              checked={isOn('email_enabled')}
              onCheckedChange={() => toggle('email_enabled')}
              disabled={busy || !isEmailConfigured}
            />
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="email-types"
        title="Email types"
        summary={typeSummary}
        permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
        instant
      >
        {TYPE_ROWS.map(({ rowId, key }) => (
          <SettingsRow key={rowId} rowId={rowId}>
            {({ controlId }) => (
              <Switch id={controlId} checked={isOn(key)} onCheckedChange={() => toggle(key)} disabled={busy} />
            )}
          </SettingsRow>
        ))}
        <div className="border-t px-4 py-4 md:px-5">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Three controls affect payment reminders. <strong>Send payment reminders</strong> on the{' '}
              <Link href="/settings/reminders#on-off" className="text-primary underline">Reminders</Link> page turns the automatic
              daily reminders on or off; the scheduled job on the Coolify server runs them once a day, with the steps set in{' '}
              <Link href="/settings/reminders#schedule" className="text-primary underline">Schedule</Link>.{' '}
              <strong>Payment reminders</strong> above turns reminder emails on or off for both the daily job and the manual run, and the days set in{' '}
              <Link href="/settings/billing" className="text-primary underline">Billing Settings</Link> limit when either sends before the due date.{' '}
              <strong>Send payment reminders now</strong> under{' '}
              <Link href="/settings/reminders#send-test" className="text-primary underline">Send now</Link> sends one email-only run on those days.
            </AlertDescription>
          </Alert>
        </div>
      </SettingsSection>
    </>
  );
}
