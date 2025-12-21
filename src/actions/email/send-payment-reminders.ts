'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { getSettingValue } from '@/actions/settings/get-settings';
import { updateSetting } from '@/actions/settings/update-setting';
import { logAudit } from '@/lib/audit/logger';
import { PaymentReminderEmail } from '@/emails';

interface ReminderResult {
  success: boolean;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Send payment reminders for invoices due based on configured reminder days
 * Called by Vercel Cron job or manually from settings UI
 */
export async function sendPaymentReminders(): Promise<ReminderResult> {
  const supabase = await createServerSupabaseClient();

  // Check auth for manual trigger (cron bypasses this via API route)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result: ReminderResult = {
    success: true,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Check if reminders are enabled
  const remindersEnabled = await getSettingValue('email_payment_reminders_enabled');
  if (remindersEnabled === false) {
    return { ...result, errors: ['Payment reminders are disabled'] };
  }

  // Get reminder days configuration (e.g., [7, 3, 1])
  const reminderDaysRaw = await getSettingValue('payment_reminder_days');
  let reminderDays: number[] = [7, 3, 1]; // Default

  if (Array.isArray(reminderDaysRaw)) {
    reminderDays = reminderDaysRaw.map((d) => Number(d)).filter((d) => !isNaN(d));
  }

  if (reminderDays.length === 0) {
    return { ...result, errors: ['No reminder days configured'] };
  }

  // Get estate settings for email template
  const estateSettings = await getEstateEmailSettings();

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
      const resident = invoice.resident as any;
      const house = invoice.house as any;

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
        subject: `Payment Reminder: ${invoice.invoice_number}`,
        react: PaymentReminderEmail({
          residentName: `${resident.first_name} ${resident.last_name}`,
          invoiceNumber: invoice.invoice_number,
          amountDue: amountRemaining,
          dueDate: formattedDueDate,
          daysUntilDue: daysAhead,
          houseNumber: house?.house_number || '',
          streetName: house?.street?.name,
          ...estateSettings,
        }),
        emailType: 'payment_reminder',
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
  await updateSetting('email_last_reminder_run', new Date().toISOString());

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'system_settings',
    entityId: 'payment_reminders',
    entityDisplay: 'Payment Reminder Batch',
    description: `Sent ${result.sent} reminders, ${result.skipped} skipped, ${result.failed} failed`,
    metadata: {
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    },
  });

  return result;
}
