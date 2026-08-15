'use server';

import { queueInvoiceGeneratedEmail } from '@/lib/notifications/invoice-generation-email';

interface SendInvoiceEmailResult {
  success: boolean;
  queueId?: string;
  error?: string;
}

/** Queue an invoice email for durable post-commit delivery. */
export async function sendInvoiceEmail(invoiceId: string): Promise<SendInvoiceEmailResult> {
  const result = await queueInvoiceGeneratedEmail(invoiceId, 'manual');
  return {
    success: result.status === 'queued',
    queueId: result.queueId,
    error: result.error,
  };
}
