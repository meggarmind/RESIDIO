'use client';

import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { useSettings } from '@/hooks/use-settings';
import { useSendPaymentReminders } from '@/hooks/use-email';
import { previewPaymentReminders } from '@/actions/email/send-payment-reminders';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';

/** One email-only round of reminders on demand. Moved from the Email Debug page (#934). */
export function SendRemindersNowSection() {
  const { data: settings } = useSettings('email');
  const sendReminders = useSendPaymentReminders();
  const lastRun = settings?.find((setting) => setting.key === 'email_last_reminder_run')?.value as string | null | undefined;

  return (
    <SettingsSection
      id="send-test"
      title="Send now"
      summary={lastRun ? `Last manual run ${new Date(lastRun).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Not run yet'}
      permissions={[PERMISSIONS.SETTINGS_MANAGE_GENERAL]}
      defaultCollapsed
      instant
    >
      <SettingsRow rowId="send-reminders-now">
        <ConfirmAction
          trigger={
            <Button variant="outline" disabled={sendReminders.isPending}>
              {sendReminders.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Reminders
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
      </SettingsRow>
      <p className="border-t px-4 py-4 text-sm text-muted-foreground md:px-5">
        Outside production the reminders are redirected to the override contacts, and blocked if the override email is
        blank. In production they go to the real recipients unless Debug Mode is on (see Email &amp; sending, Testing).
        Only the days ticked in Billing rules send.
      </p>
    </SettingsSection>
  );
}
