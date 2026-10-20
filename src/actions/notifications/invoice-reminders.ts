'use server';

/**
 * Invoice Reminder Actions
 *
 * Manual and per-invoice reminder operations. The automated batch run lives in
 * src/lib/notifications/invoice-reminders.ts, outside this server-action module,
 * so it is reachable only from the cron route (#875).
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { getEstateEmailSettings } from '@/lib/email';
import { logAudit } from '@/lib/audit/logger';
import { determineEscalationLevel } from '@/emails/payment-reminder-escalated';
import type {
  NotificationChannel,
  ReminderScheduleStep,
} from '@/lib/notifications/types';
import {
  getOrCreateEscalationState,
  resolveAllEscalationsForEntity,
} from '@/lib/notifications/escalation';
import { PRIORITY } from '@/lib/notifications/queue';
import {
  sendReminderToChannels,
  type InvoiceForReminder,
} from '@/lib/notifications/invoice-reminders';

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
