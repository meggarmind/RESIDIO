/**
 * Automated Invoice Reminder System
 *
 * Handles the scheduling and sending of invoice payment reminders
 * with escalation support and multi-channel delivery.
 *
 * Deliberately NOT a server-action module (no directive): the batch run sends
 * reminders to every resident with a due invoice and must never be reachable as a
 * client-callable server action. Sole caller of processInvoiceReminders is the
 * CRON_SECRET-authenticated route `/api/cron/payment-reminders`, which is
 * responsible for authentication. See #875.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import type { EstateEmailSettings } from '@/lib/email/types';
import { sendSms } from '@/lib/sms/send-sms';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { isChannelImplemented } from '@/lib/notifications/types';
import { getSettingValueAsService } from '@/lib/settings/service';
import { readPaymentReminderSettings, applyPaymentReminderSettings } from '@/lib/notifications/payment-reminder-settings';
import {
  getReminderSchedule,
  areRemindersEnabled,
} from '@/actions/notifications/reminder-config';
import {
  PaymentReminderEscalatedEmail,
  getEscalatedReminderSubject,
} from '@/emails/payment-reminder-escalated';
import type { ReminderEscalationLevel } from '@/emails/payment-reminder-escalated';
import {
  generatePaymentReminderSms,
  type SmsTemplateParams,
} from '@/lib/sms/templates/payment-reminder';
import type {
  ReminderScheduleStep,
  ProcessRemindersResult,
} from '@/lib/notifications/types';
import {
  getOrCreateEscalationState,
  advanceEscalation,
} from '@/lib/notifications/escalation';
import { addToQueue } from '@/lib/notifications/queue';
import { shouldSendToResident } from '@/lib/notifications/preferences';
import { formatDueText, formatEventCurrency, getEventContent } from '@/lib/notifications/event-content';
import { buildInvoiceReminderWhatsApp } from '@/lib/whatsapp/outbound';

/**
 * Invoice with related data for reminder sending
 */
interface InvoiceForReminder {
  id: string;
  invoice_number: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  status: string;
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone_primary: string | null;
  };
  house: {
    house_number: string;
    street: {
      name: string;
    } | null;
  };
}

/**
 * Process all due invoice reminders
 * Called by the cron job to send reminders for all applicable invoices
 */
export async function processInvoiceReminders(): Promise<ProcessRemindersResult> {
  const result: ProcessRemindersResult = {
    processed: 0,
    sent: {
      email: 0,
      sms: 0,
      whatsapp: 0,
    },
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Check if reminders are enabled
  const enabled = await areRemindersEnabled();
  if (!enabled) {
    console.log('[InvoiceReminders] Reminders are disabled');
    return result;
  }

  // Get reminder schedule
  const { data: schedule, error: scheduleError } = await getReminderSchedule();
  if (scheduleError || !schedule) {
    console.error('[InvoiceReminders] Failed to load schedule:', scheduleError);
    result.failed++;
    result.errors.push({ invoiceId: 'schedule', error: `Failed to load schedule: ${scheduleError ?? 'no schedule'}` });
    return result;
  }

  // The reminder days and email switch the manual run uses apply here too (#846).
  // Service-role read: the cron runs without a session.
  const paymentSettings = await readPaymentReminderSettings(getSettingValueAsService);
  const steps = applyPaymentReminderSettings(schedule.steps, paymentSettings);

  // Get estate settings for email template
  const estateSettings = await getEstateEmailSettings();

  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Process each active step in the schedule
  for (const step of steps) {
    if (!step.isActive) continue;

    // Calculate the target due date for this step
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - step.daysFromDue);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`[InvoiceReminders] Processing step: ${step.daysFromDue} days from due (target date: ${targetDateStr})`);

    // Find invoices due on this date
    const { invoices, error: fetchError } = await getInvoicesForReminder(targetDateStr);
    if (fetchError) {
      // A failed read is a failed step, not an empty one: the cron route reports it.
      result.failed++;
      result.errors.push({
        invoiceId: `step:${step.daysFromDue}`,
        error: `Failed to fetch invoices: ${fetchError}`,
      });
      continue;
    }

    for (const invoice of invoices) {
      result.processed++;

      // Skip if no contact info
      if (!invoice.resident.email && !invoice.resident.phone_primary) {
        result.skipped++;
        continue;
      }

      // Calculate remaining amount
      const amountRemaining = invoice.amount_due - invoice.amount_paid;
      if (amountRemaining <= 0) {
        result.skipped++;
        continue;
      }

      // Get or create escalation state
      const escalationState = await getOrCreateEscalationState({
        entityType: 'invoice',
        entityId: invoice.id,
        residentId: invoice.resident.id,
      });

      // Check if we should skip based on escalation state
      if (escalationState?.is_resolved) {
        result.skipped++;
        continue;
      }

      // A re-run on the same day (e.g. a manual retry after a timeout) must not resend.
      if (
        escalationState?.last_notified_at &&
        new Date(escalationState.last_notified_at) >= today
      ) {
        result.skipped++;
        continue;
      }

      // Send reminders via configured channels
      const sendResults = await sendReminderToChannels({
        invoice,
        step,
        amountRemaining,
        estateSettings,
        todayStr,
        reminderCount: (escalationState?.current_level || 0) + 1,
      });

      // Update results
      if (sendResults.email) result.sent.email++;
      if (sendResults.sms) result.sent.sms++;
      if (sendResults.whatsapp) result.sent.whatsapp++;
      if (sendResults.errors.length > 0) {
        result.failed++;
        result.errors.push(...sendResults.errors.map(e => ({
          invoiceId: invoice.id,
          error: e,
        })));
      }

      // Advance escalation state
      if (sendResults.email || sendResults.sms || sendResults.whatsapp) {
        await advanceEscalation({
          entityType: 'invoice',
          entityId: invoice.id,
          residentId: invoice.resident.id,
          notificationId: `reminder-${Date.now()}`,
        });
      }
    }
  }

  // The run is recorded by the cron route's System Action Log row (withSystemLog). There is no
  // session here, so updateSetting and logAudit could never write (#846).
  return result;
}

/**
 * Get invoices that need reminders for a specific due date
 */
async function getInvoicesForReminder(
  dueDateStr: string
): Promise<{ invoices: InvoiceForReminder[]; error?: string }> {
  const supabase = createAdminClient();

  // For overdue invoices (positive daysFromDue), we need to check multiple dates
  let query = supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      amount_due,
      amount_paid,
      due_date,
      status,
      resident:residents!invoices_resident_id_fkey(
        id,
        first_name,
        last_name,
        email,
        phone_primary
      ),
      house:houses!invoices_house_id_fkey(
        house_number,
        street:streets(name)
      )
    `)
    .in('status', ['unpaid', 'partially_paid']);

  // For upcoming reminders (negative daysFromDue), match exact due date
  // For overdue reminders (positive daysFromDue), match exact due date as well
  query = query.eq('due_date', dueDateStr);

  const { data, error } = await query;

  if (error) {
    console.error('[InvoiceReminders] Failed to fetch invoices:', error);
    return { invoices: [], error: error.message };
  }

  return { invoices: (data || []) as unknown as InvoiceForReminder[] };
}

/**
 * Send reminder through configured channels
 */
async function sendReminderToChannels(params: {
  invoice: InvoiceForReminder;
  step: ReminderScheduleStep;
  amountRemaining: number;
  estateSettings: EstateEmailSettings;
  todayStr: string;
  reminderCount: number;
}): Promise<{
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  errors: string[];
}> {
  const { invoice, step, amountRemaining, estateSettings, todayStr, reminderCount } = params;
  const results = { email: false, sms: false, whatsapp: false, errors: [] as string[] };

  // Format due date for display
  const formattedDueDate = new Date(invoice.due_date).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const residentName = `${invoice.resident.first_name} ${invoice.resident.last_name}`;

  // Send via each configured channel
  for (const channel of step.channels) {
    // SMS is off until Termii is connected: an intentional skip, not an error.
    // Re-enabling means adding 'sms' to IMPLEMENTED_CHANNELS once its provider
    // path is operational; the 'sms' case below is kept for that.
    if (!isChannelImplemented(channel)) continue;

    switch (channel) {
      case 'email':
        if (invoice.resident.email) {
          const emailResult = await sendEmailReminder({
            invoice,
            amountRemaining,
            formattedDueDate,
            daysFromDue: step.daysFromDue,
            escalationLevel: step.escalationLevel,
            estateSettings,
            reminderCount,
          });
          if (emailResult.success) {
            results.email = true;
          } else {
            results.errors.push(`Email: ${emailResult.error}`);
          }
        }
        break;

      case 'sms':
        if (invoice.resident.phone_primary) {
          const smsResult = await sendSmsReminder({
            invoice,
            amountRemaining,
            formattedDueDate,
            daysFromDue: step.daysFromDue,
            escalationLevel: step.escalationLevel,
            estateName: estateSettings.estateName || 'Estate',
          });
          if (smsResult.success) {
            results.sms = true;
          } else {
            results.errors.push(`SMS: ${smsResult.error}`);
          }
        }
        break;

      case 'whatsapp':
        if (invoice.resident.phone_primary) {
          const prefCheck = await shouldSendToResident({
            residentId: invoice.resident.id,
            category: 'invoice',
            channel: 'whatsapp',
          });
          if (!prefCheck.shouldSend) {
            results.errors.push(`WhatsApp: ${prefCheck.reason || 'Blocked by preferences'}`);
            break;
          }

          if (!(await isWhatsAppOptedIn(invoice.resident.id, invoice.resident.phone_primary))) {
            results.errors.push('WhatsApp: recipient has not opted in');
            break;
          }

          const result = await addToQueue({
            ...buildInvoiceReminderWhatsApp({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              residentId: invoice.resident.id,
              residentPhone: invoice.resident.phone_primary,
              residentName,
              amountRemaining,
              dueDate: formattedDueDate,
            }),
            deduplication_key: `invoice-reminder:${invoice.id}:${todayStr}`,
          });
          if (result.success) results.whatsapp = true;
          else results.errors.push(`WhatsApp: ${result.error}`);
        }
        break;
    }
  }

  return results;
}

/**
 * Send email reminder
 */
async function sendEmailReminder(params: {
  invoice: InvoiceForReminder;
  amountRemaining: number;
  formattedDueDate: string;
  daysFromDue: number;
  escalationLevel: ReminderEscalationLevel;
  estateSettings: EstateEmailSettings;
  reminderCount: number;
}): Promise<{ success: boolean; error?: string }> {
  const {
    invoice,
    amountRemaining,
    formattedDueDate,
    daysFromDue,
    escalationLevel,
    estateSettings,
    reminderCount,
  } = params;

  const residentName = `${invoice.resident.first_name} ${invoice.resident.last_name}`;

  try {
    // Communications override (#716): fail closed if the resident's flag cannot be read.
    const override = await resolveResidentOverride([invoice.resident.id]);
    if (!override.ok) return { success: false, error: override.error };

    const copy = await getEventContent('payment_reminder_escalated');

    const result = await sendEmail({
      to: {
        email: invoice.resident.email!,
        name: residentName,
        residentId: invoice.resident.id,
      },
      subject: getEscalatedReminderSubject(invoice.invoice_number, escalationLevel, copy, {
        resident_name: residentName,
        amount: formatEventCurrency(amountRemaining),
        due_date: formattedDueDate,
        due_text: formatDueText(-daysFromDue),
        days_overdue: Math.abs(daysFromDue),
        property: invoice.house?.street?.name
          ? `${invoice.house.house_number}, ${invoice.house.street.name}`
          : invoice.house?.house_number || '',
        estate_name: estateSettings.estateName || 'Estate',
      }),
      react: PaymentReminderEscalatedEmail({
        copy,
        residentName,
        invoiceNumber: invoice.invoice_number,
        amountDue: amountRemaining,
        dueDate: formattedDueDate,
        daysUntilDue: -daysFromDue, // Convert to days until due (negative = after due)
        houseNumber: invoice.house?.house_number || '',
        streetName: invoice.house?.street?.name,
        estateName: estateSettings.estateName || 'Estate',
        estateEmail: estateSettings.estateEmail,
        estatePhone: estateSettings.estatePhone,
        estateAddress: estateSettings.estateAddress,
        escalationLevel,
        reminderCount,
      }),
      emailType: 'payment_reminder',
      residentOverride: override.residentOverride,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        daysFromDue,
        escalationLevel,
        reminderCount,
      },
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send SMS reminder
 */
async function sendSmsReminder(params: {
  invoice: InvoiceForReminder;
  amountRemaining: number;
  formattedDueDate: string;
  daysFromDue: number;
  escalationLevel: ReminderEscalationLevel;
  estateName: string;
}): Promise<{ success: boolean; error?: string }> {
  const {
    invoice,
    amountRemaining,
    formattedDueDate,
    daysFromDue,
    escalationLevel,
    estateName,
  } = params;

  const residentName = `${invoice.resident.first_name} ${invoice.resident.last_name}`;

  // Generate SMS content
  const smsParams: SmsTemplateParams = {
    residentName,
    invoiceNumber: invoice.invoice_number,
    amountDue: amountRemaining,
    dueDate: formattedDueDate,
    daysUntilDue: -daysFromDue,
    estateName,
  };

  const smsMessage = generatePaymentReminderSms(smsParams, escalationLevel);

  try {
    // Communications override (#716): fail closed if the resident's flag cannot be read.
    const override = await resolveResidentOverride([invoice.resident.id]);
    if (!override.ok) return { success: false, error: override.error };

    const result = await sendSms({
      to: {
        phone: invoice.resident.phone_primary!,
        name: residentName,
        residentId: invoice.resident.id,
      },
      message: smsMessage,
      smsType: 'payment_reminder',
      residentOverride: override.residentOverride,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        daysFromDue,
        escalationLevel,
      },
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
