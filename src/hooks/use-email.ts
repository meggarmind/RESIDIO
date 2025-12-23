'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { testEmail } from '@/actions/email/test-email';
import { sendPaymentReminders } from '@/actions/email/send-payment-reminders';
import { sendInvoiceEmail } from '@/actions/email/send-invoice-email';
import { sendWelcomeEmail } from '@/actions/email/send-welcome-email';
import { sendPaymentReceiptEmail, getPaymentRecipients } from '@/actions/email/send-payment-receipt-email';
import { toast } from 'sonner';

/**
 * Hook for sending a test email
 */
export function useTestEmail() {
  return useMutation({
    mutationFn: testEmail,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Test email sent successfully');
      } else {
        toast.error(result.error || 'Failed to send test email');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send test email');
    },
  });
}

/**
 * Hook for manually triggering payment reminders
 */
export function useSendPaymentReminders() {
  return useMutation({
    mutationFn: sendPaymentReminders,
    onSuccess: (result) => {
      if (result.success) {
        if (result.sent > 0) {
          toast.success(`Sent ${result.sent} reminder(s)`, {
            description: result.skipped > 0 ? `${result.skipped} skipped (no email)` : undefined,
          });
        } else if (result.skipped > 0) {
          toast.info(`No reminders sent. ${result.skipped} skipped (no email or already paid)`);
        } else {
          toast.info('No invoices due for reminders today');
        }
      } else {
        toast.error(result.errors[0] || 'Failed to send reminders');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send reminders');
    },
  });
}

/**
 * Hook for sending an invoice email
 */
export function useSendInvoiceEmail() {
  return useMutation({
    mutationFn: sendInvoiceEmail,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Invoice email sent');
      } else {
        toast.error(result.error || 'Failed to send invoice email');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send invoice email');
    },
  });
}

/**
 * Hook for sending a welcome email
 */
export function useSendWelcomeEmail() {
  return useMutation({
    mutationFn: sendWelcomeEmail,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Welcome email sent');
      }
      // Don't show error for welcome emails - they're often triggered automatically
    },
    onError: () => {
      // Silently fail for welcome emails
    },
  });
}

/**
 * Hook for getting potential recipients for a payment receipt
 */
export function usePaymentRecipients(paymentId: string | undefined) {
  return useQuery({
    queryKey: ['payment-recipients', paymentId],
    queryFn: async () => {
      if (!paymentId) throw new Error('Payment ID is required');
      return getPaymentRecipients(paymentId);
    },
    enabled: !!paymentId,
  });
}

/**
 * Hook for sending a payment receipt email
 */
export function useSendPaymentReceiptEmail() {
  return useMutation({
    mutationFn: async ({ paymentId, recipientEmails }: { paymentId: string; recipientEmails: string[] }) => {
      return sendPaymentReceiptEmail(paymentId, recipientEmails);
    },
    onSuccess: (result) => {
      if (result.success) {
        const count = result.sentTo?.length || 0;
        toast.success(`Receipt sent to ${count} recipient${count > 1 ? 's' : ''}`);
      } else {
        toast.error(result.error || 'Failed to send receipt');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to send receipt');
    },
  });
}
