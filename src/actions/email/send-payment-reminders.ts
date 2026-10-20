'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { embed } from '@/lib/utils';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { getSettingValue } from '@/actions/settings/get-settings';
import { readPaymentReminderSettings } from '@/lib/notifications/payment-reminder-settings';
import { updateSetting } from '@/actions/settings/update-setting';
import { logAudit } from '@/lib/audit/logger';
import { PaymentReminderEmail } from '@/emails';
import { formatEventCurrency, getEventContent, renderEventText } from '@/lib/notifications/event-content';

interface ReminderResult {
  success: boolean;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Send payment reminders for invoices due based on configured reminder days
 * Admin-triggered from the settings UI (requires settings.manage_general)
 */
export async function sendPaymentReminders(): Promise<ReminderResult> {
  // Admin-triggered only (settings > email debug). Cron does not call this action.
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) {
    return { success: false, sent: 0, skipped: 0, failed: 0, errors: [auth.error || 'Unauthorized'] };
  }

  const supabase = await createServerSupabaseClient();

  const result: ReminderResult = {
    success: true,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Same settings the daily cron applies (#846)
  const { emailEnabled, reminderDays } = await readPaymentReminderSettings(getSettingValue);
  if (!emailEnabled) {
    return { ...result, errors: ['Payment reminders are disabled'] };
  }

  if (reminderDays.length === 0) {
    return { ...result, errors: ['No reminder days configured'] };
  }

  // Get estate settings for email template
  const estateSettings = await getEstateEmailSettings();
  const copy = await getEventContent('payment_reminder');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Process each reminder day
  for (const daysAhead of reminderDays) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find unpaid/partially paid invoices due on this date
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_number,
        amount_due,
        amount_paid,
        due_date,
        resident:residents(
          id,
          first_name,
          last_name,
          email
        ),
        house:houses(
          house_number,
          street:streets(name)
        )
      `
      )
      .eq('due_date', targetDateStr)
      .in('status', ['unpaid', 'partially_paid']);

    if (error) {
      result.errors.push(`Query error for ${daysAhead} days: ${error.message}`);
      continue;
    }

    // Send reminders for each invoice
    for (const invoice of invoices || []) {
      const resident = embed(invoice.resident);
      const house = embed(invoice.house);

      // Skip if no email
      if (!resident?.email) {
        result.skipped++;
        continue;
      }

      // Calculate remaining amount
      const amountRemaining = invoice.amount_due - invoice.amount_paid;
      if (amountRemaining <= 0) {
        result.skipped++;
        continue;
      }

      // Communications override (#716): fail closed if the resident's flag cannot be read.
      const override = await resolveResidentOverride([resident.id]);
      if (!override.ok) {
        result.failed++;
        result.errors.push(`${invoice.invoice_number}: ${override.error}`);
        continue;
      }

      // Format due date for display
      const formattedDueDate = new Date(invoice.due_date).toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const emailResult = await sendEmail({
        to: {
          email: resident.email,
          name: `${resident.first_name} ${resident.last_name}`,
          residentId: resident.id,
        },
        subject: renderEventText(copy.subject, {
          resident_name: `${resident.first_name} ${resident.last_name}`,
          invoice_number: invoice.invoice_number,
          amount: formatEventCurrency(amountRemaining),
          due_date: formattedDueDate,
          property: house?.house_number || '',
          estate_name: estateSettings.estateName,
        }),
        react: PaymentReminderEmail({
          copy,
          residentName: `${resident.first_name} ${resident.last_name}`,
          invoiceNumber: invoice.invoice_number,
          amountDue: amountRemaining,
          dueDate: formattedDueDate,
          daysUntilDue: daysAhead,
          houseNumber: house?.house_number || '',
          streetName: embed(house?.street)?.name,
          ...estateSettings,
        }),
        emailType: 'payment_reminder',
        residentOverride: override.residentOverride,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          daysUntilDue: daysAhead,
        },
      });

      if (emailResult.success) {
        result.sent++;
      } else {
        result.failed++;
        result.errors.push(`${invoice.invoice_number}: ${emailResult.error}`);
      }
    }
  }

  // Update last run timestamp
  const { data: lastRunSetting } = await updateSetting('email_last_reminder_run', new Date().toISOString());

  // Audit log. audit_logs.entity_id is a uuid: use the system_settings row id that
  // was just written; the label stays in entityDisplay/metadata (#594).
  if (lastRunSetting?.id) {
    await logAudit({
      action: 'GENERATE',
      entityType: 'system_settings',
      entityId: lastRunSetting.id,
      entityDisplay: 'Payment Reminder Batch',
      description: `Sent ${result.sent} reminders, ${result.skipped} skipped, ${result.failed} failed`,
      metadata: {
        batch: 'payment_reminders',
        setting_key: 'email_last_reminder_run',
        sent: result.sent,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
      },
    });
  }

  return result;
}

/**
 * Who `sendPaymentReminders` would email right now, for its confirmation dialog (#790).
 * Same settings, query and skip rules, without sending. Reads only.
 */
export async function previewPaymentReminders(): Promise<{
  data: { recipients: number; invoices: number; skipped: number; disabledReason: string | null } | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const empty = { recipients: 0, invoices: 0, skipped: 0 };
  const { emailEnabled, reminderDays } = await readPaymentReminderSettings(getSettingValue);
  if (!emailEnabled) {
    return { data: { ...empty, disabledReason: 'Payment reminders are disabled' }, error: null };
  }
  if (reminderDays.length === 0) {
    return { data: { ...empty, disabledReason: 'No reminder days configured' }, error: null };
  }

  const supabase = await createServerSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDates = reminderDays.map((daysAhead) => {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    return targetDate.toISOString().split('T')[0];
  });

  // One query per reminder day, as the send loop runs them; a date listed twice is sent twice.
  const results = await Promise.all(targetDates.map((date) =>
    supabase
      .from('invoices')
      .select('amount_due, amount_paid, resident:residents(id, email)')
      .eq('due_date', date)
      .in('status', ['unpaid', 'partially_paid'])
  ));
  const failed = results.find((r) => r.error);
  if (failed?.error) return { data: null, error: failed.error.message };

  const recipients = new Set<string>();
  let invoices = 0;
  let skipped = 0;
  for (const invoice of results.flatMap((r) => r.data || [])) {
    const resident = embed(invoice.resident);
    if (!resident?.email || invoice.amount_due - invoice.amount_paid <= 0) {
      skipped++;
      continue;
    }
    invoices++;
    recipients.add(resident.id);
  }
  return { data: { recipients: recipients.size, invoices, skipped, disabledReason: null }, error: null };
}
