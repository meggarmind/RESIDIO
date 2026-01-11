'use server';

/**
 * Automated Invoice Reminder System
 *
 * Handles the scheduling and sending of invoice payment reminders
 * with escalation support and multi-channel delivery.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import type { EstateEmailSettings } from '@/lib/email/types';
import { sendSms } from '@/lib/sms/send-sms';
import { getSettingValue } from '@/actions/settings/get-settings';
import { updateSetting } from '@/actions/settings/update-setting';
import { logAudit } from '@/lib/audit/logger';
import {
  getReminderSchedule,
  areRemindersEnabled,
  getActiveDays,
} from './reminder-config';
import {
  PaymentReminderEscalatedEmail,
  getEscalatedReminderSubject,
  determineEscalationLevel,
} from '@/emails/payment-reminder-escalated';
import type { ReminderEscalationLevel } from '@/emails/payment-reminder-escalated';
import {
  generatePaymentReminderSms,
  type SmsTemplateParams,
} from '@/lib/sms/templates/payment-reminder';
import type {
  NotificationChannel,
  ReminderScheduleStep,
  ProcessRemindersResult,
  InvoiceReminderState,
} from '@/lib/notifications/types';
import {
  getOrCreateEscalationState,
  advanceEscalation,
  resolveAllEscalationsForEntity,
} from '@/lib/notifications/escalation';
import { addToQueue, PRIORITY } from '@/lib/notifications/queue';

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
    return result;
  }

  // Get estate settings for email template
  const estateSettings = await getEstateEmailSettings();

  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Process each active step in the schedule
  for (const step of schedule.steps) {
    if (!step.isActive) continue;

    // Calculate the target due date for this step
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - step.daysFromDue);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    console.log(`[InvoiceReminders] Processing step: ${step.daysFromDue} days from due (target date: ${targetDateStr})`);

    // Find invoices due on this date
    const invoices = await getInvoicesForReminder(targetDateStr, step.daysFromDue);

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

      // Send reminders via configured channels
      const sendResults = await sendReminderToChannels({
        invoice,
        step,
        amountRemaining,
        estateSettings,
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

  // Update last run timestamp
  await updateSetting('invoice_reminder_last_run', new Date().toISOString());

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'system_settings',
    entityId: 'invoice_reminders',
    entityDisplay: 'Invoice Reminder Batch',
    description: `Processed ${result.processed} invoices, sent ${result.sent.email} emails, ${result.sent.sms} SMS`,
    metadata: JSON.parse(JSON.stringify(result)),
  });

  return result;
}

/**
 * Get invoices that need reminders for a specific due date
 */
async function getInvoicesForReminder(
  dueDateStr: string,
  daysFromDue: number
): Promise<InvoiceForReminder[]> {
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
    return [];
  }

  return (data || []) as unknown as InvoiceForReminder[];
}

/**
 * Send reminder through configured channels
 */
async function sendReminderToChannels(params: {
  invoice: InvoiceForReminder;
  step: ReminderScheduleStep;
  amountRemaining: number;
  estateSettings: EstateEmailSettings;
  reminderCount: number;
}): Promise<{
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  errors: string[];
}> {
  const { invoice, step, amountRemaining, estateSettings, reminderCount } = params;
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
        // WhatsApp not yet implemented - skip
        console.log('[InvoiceReminders] WhatsApp not yet implemented');
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
    const result = await sendEmail({
      to: {
        email: invoice.resident.email!,
        name: residentName,
        residentId: invoice.resident.id,
      },
      subject: getEscalatedReminderSubject(invoice.invoice_number, escalationLevel),
      react: PaymentReminderEscalatedEmail({
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
    const result = await sendSms({
      to: {
        phone: invoice.resident.phone_primary!,
        name: residentName,
        residentId: invoice.resident.id,
      },
      message: smsMessage,
      smsType: 'payment_reminder',
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

/**
 * Send a manual reminder for a specific invoice
 */
export async function sendManualReminder(
  invoiceId: string,
  channels: NotificationChannel[] = ['email']
): Promise<{
  success: boolean;
  sent: { email: boolean; sms: boolean; whatsapp: boolean };
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();

  // Fetch invoice with related data
  const { data: invoice, error } = await supabase
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
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) {
    return {
      success: false,
      sent: { email: false, sms: false, whatsapp: false },
      error: 'Invoice not found',
    };
  }

  const typedInvoice = invoice as unknown as InvoiceForReminder;

  // Calculate days from due
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(typedInvoice.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const daysFromDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  // Determine escalation level based on days
  const escalationLevel = determineEscalationLevel(-daysFromDue);

  // Get estate settings
  const estateSettings = await getEstateEmailSettings();

  // Get escalation state for reminder count
  const escalationState = await getOrCreateEscalationState({
    entityType: 'invoice',
    entityId: invoiceId,
    residentId: typedInvoice.resident.id,
  });

  const amountRemaining = typedInvoice.amount_due - typedInvoice.amount_paid;

  // Create a pseudo step with the specified channels
  const step: ReminderScheduleStep = {
    id: 'manual',
    daysFromDue,
    escalationLevel,
    channels,
    isActive: true,
    priority: PRIORITY.HIGH,
  };

  const results = await sendReminderToChannels({
    invoice: typedInvoice,
    step,
    amountRemaining,
    estateSettings,
    reminderCount: (escalationState?.current_level || 0) + 1,
  });

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'invoices',
    entityId: invoiceId,
    entityDisplay: `Manual Reminder: ${typedInvoice.invoice_number}`,
    description: `Manual reminder sent via ${channels.join(', ')}`,
    metadata: {
      channels,
      escalationLevel,
      results,
    },
  });

  return {
    success: results.email || results.sms || results.whatsapp,
    sent: results,
    error: results.errors.length > 0 ? results.errors.join('; ') : undefined,
  };
}

/**
 * Resolve reminder escalation when invoice is paid
 */
export async function resolveInvoiceReminders(
  invoiceId: string,
  reason: string = 'Invoice paid'
): Promise<{ success: boolean; resolved: number }> {
  return resolveAllEscalationsForEntity({
    entityType: 'invoice',
    entityId: invoiceId,
    reason,
  });
}

/**
 * Get reminder status for an invoice
 */
export async function getInvoiceReminderStatus(
  invoiceId: string
): Promise<{
  remindersSent: number;
  lastReminderAt: string | null;
  nextScheduledAt: string | null;
  isResolved: boolean;
} | null> {
  const supabase = createAdminClient();

  // Get invoice details
  const { data: invoice } = await supabase
    .from('invoices')
    .select('resident_id')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return null;

  // Get escalation state
  const { data: state } = await supabase
    .from('escalation_states')
    .select('*')
    .eq('entity_type', 'invoice')
    .eq('entity_id', invoiceId)
    .eq('resident_id', invoice.resident_id)
    .single();

  if (!state) {
    return {
      remindersSent: 0,
      lastReminderAt: null,
      nextScheduledAt: null,
      isResolved: false,
    };
  }

  return {
    remindersSent: state.current_level || 0,
    lastReminderAt: state.last_notified_at,
    nextScheduledAt: state.next_scheduled_at,
    isResolved: state.is_resolved || false,
  };
}
