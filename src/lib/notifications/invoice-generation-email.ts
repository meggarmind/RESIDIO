import { render } from '@react-email/render';
import { getSettingValueAsService } from '@/actions/settings/get-settings';
import { InvoiceGeneratedEmail } from '@/emails';
import { getEstateEmailSettings } from '@/lib/email';
import { createAdminClient } from '@/lib/supabase/server';
import { embed } from '@/lib/utils';
import { addToQueue, PRIORITY } from './queue';

export type InvoiceEmailQueueStatus = 'queued' | 'skipped' | 'failed';

export interface InvoiceEmailQueueResult {
  status: InvoiceEmailQueueStatus;
  queueId?: string;
  error?: string;
}

const DEDUPLICATION_PREFIX = 'invoice-generated:';

export function invoiceGeneratedDeduplicationKey(invoiceId: string): string {
  return `${DEDUPLICATION_PREFIX}${invoiceId}`;
}

/**
 * Queue an invoice email after the invoice transaction has committed.
 * The queue key is unique at the database layer, so concurrent retries return
 * the existing job instead of creating another delivery attempt.
 */
export async function queueInvoiceGeneratedEmail(
  invoiceId: string,
  candidateId: string
): Promise<InvoiceEmailQueueResult> {
  // Service-role read (see #136/#139): reached from the generate-invoices
  // cron path (invoice generation worker), an unauthenticated context where
  // the RLS-bound `getSettingValue` always returns null.
  const enabled = await getSettingValueAsService('email_invoice_notifications_enabled');
  if (enabled === false) return { status: 'skipped', error: 'Invoice notifications are disabled' };

  const supabase = createAdminClient();
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, amount_due, amount_paid, due_date, period_start, period_end,
      resident:residents(id, first_name, last_name, email),
      house:houses(house_number, street:streets(name)),
      invoice_items(description, amount)
    `)
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) return { status: 'failed', error: 'Invoice not found' };

  const resident = embed(invoice.resident);
  if (!resident?.email) return { status: 'skipped', error: 'Resident has no email address' };

  const house = embed(invoice.house);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-NG', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const amountRemaining = invoice.amount_due - invoice.amount_paid;
  const estateSettings = await getEstateEmailSettings();
  const htmlBody = await render(InvoiceGeneratedEmail({
    residentName: `${resident.first_name} ${resident.last_name}`,
    invoiceNumber: invoice.invoice_number,
    amountDue: amountRemaining,
    dueDate: formatDate(invoice.due_date),
    periodStart: invoice.period_start ? formatDate(invoice.period_start) : undefined,
    periodEnd: invoice.period_end ? formatDate(invoice.period_end) : undefined,
    houseNumber: house?.house_number || '',
    streetName: embed(house?.street)?.name,
    items: (invoice.invoice_items || []).map((item) => ({ name: item.description, amount: item.amount })),
    ...estateSettings,
  }));
  const deduplicationKey = invoiceGeneratedDeduplicationKey(invoiceId);
  const metadata = {
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    candidateId,
    deduplication_key: deduplicationKey,
  };

  const queued = await addToQueue({
    recipient_id: resident.id,
    recipient_email: resident.email,
    channel: 'email',
    subject: `New Invoice: ${invoice.invoice_number}`,
    body: `New invoice ${invoice.invoice_number} for ${amountRemaining}.`,
    html_body: htmlBody,
    priority: PRIORITY.NORMAL,
    deduplication_key: deduplicationKey,
    metadata,
  });

  if (queued.success && queued.queueId) return { status: 'queued', queueId: queued.queueId };

  // A concurrent worker may have won the unique insert. Reuse that job.
  const { data: existing } = await supabase
    .from('notification_queue')
    .select('id, status')
    .eq('deduplication_key', deduplicationKey)
    .maybeSingle();
  if (existing) {
    return {
      status: existing.status === 'failed' ? 'failed' : 'queued',
      queueId: existing.id,
      error: queued.error,
    };
  }

  return { status: 'failed', error: queued.error || 'Could not queue invoice email' };
}
