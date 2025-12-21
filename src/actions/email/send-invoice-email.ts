'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendEmail, getEstateEmailSettings } from '@/lib/email';
import { getSettingValue } from '@/actions/settings/get-settings';
import { InvoiceGeneratedEmail } from '@/emails';

interface SendInvoiceEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send an email notification when a new invoice is generated
 */
export async function sendInvoiceEmail(invoiceId: string): Promise<SendInvoiceEmailResult> {
  // Check if invoice emails are enabled
  const enabled = await getSettingValue('email_invoice_notifications_enabled');
  if (enabled === false) {
    return { success: false, error: 'Invoice notifications are disabled' };
  }

  const supabase = await createServerSupabaseClient();

  // Get invoice with related data
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      `
      id,
      invoice_number,
      amount_due,
      amount_paid,
      due_date,
      period_start,
      period_end,
      resident:residents(
        id,
        first_name,
        last_name,
        email
      ),
      house:houses(
        house_number,
        street:streets(name)
      ),
      invoice_items(
        description,
        amount
      )
    `
    )
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  const resident = invoice.resident as any;
  if (!resident?.email) {
    return { success: false, error: 'Resident has no email address' };
  }

  // Get estate settings
  const estateSettings = await getEstateEmailSettings();

  const house = invoice.house as any;
  const items = (invoice.invoice_items || []).map((item: any) => ({
    name: item.description,
    amount: item.amount,
  }));

  // Calculate remaining amount
  const amountRemaining = invoice.amount_due - invoice.amount_paid;

  // Format dates for display
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const result = await sendEmail({
    to: {
      email: resident.email,
      name: `${resident.first_name} ${resident.last_name}`,
      residentId: resident.id,
    },
    subject: `New Invoice: ${invoice.invoice_number}`,
    react: InvoiceGeneratedEmail({
      residentName: `${resident.first_name} ${resident.last_name}`,
      invoiceNumber: invoice.invoice_number,
      amountDue: amountRemaining,
      dueDate: formatDate(invoice.due_date),
      periodStart: invoice.period_start ? formatDate(invoice.period_start) : undefined,
      periodEnd: invoice.period_end ? formatDate(invoice.period_end) : undefined,
      houseNumber: house?.house_number || '',
      streetName: house?.street?.name,
      items,
      ...estateSettings,
    }),
    emailType: 'invoice_generated',
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amountDue: amountRemaining,
    },
  });

  return result;
}
