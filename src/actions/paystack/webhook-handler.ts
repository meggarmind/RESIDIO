'use server';

import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import {
  verifyWebhookSignature,
  koboToNaira,
} from '@/lib/paystack';
import type {
  PaystackWebhookPayload,
  PaystackTransactionStatus,
  WebhookProcessingResult,
} from '@/lib/paystack';
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet';
import { logAudit } from '@/lib/audit/logger';

/**
 * Process Paystack webhook events
 *
 * This handles webhook callbacks from Paystack for:
 * - charge.success: Payment completed
 * - charge.failed: Payment failed
 *
 * Webhooks are critical for payment reconciliation as they provide
 * authoritative payment status even if the user doesn't return to
 * the callback URL.
 */
export async function processPaystackWebhook(
  payload: string,
  signature: string
): Promise<WebhookProcessingResult> {
  // Verify webhook signature
  const isValidSignature = await verifyWebhookSignature(payload, signature);
  if (!isValidSignature) {
    console.error('[Paystack Webhook] Invalid signature');
    return { success: false, error: 'Invalid webhook signature' };
  }

  // Parse payload
  let event: PaystackWebhookPayload;
  try {
    event = JSON.parse(payload) as PaystackWebhookPayload;
  } catch {
    console.error('[Paystack Webhook] Invalid JSON payload');
    return { success: false, error: 'Invalid webhook payload' };
  }

  const eventType = event.event;
  const txData = event.data;

  console.log(`[Paystack Webhook] Received ${eventType} for reference ${txData.reference}`);

  // Only process charge events
  if (!['charge.success', 'charge.failed'].includes(eventType)) {
    console.log(`[Paystack Webhook] Ignoring event type: ${eventType}`);
    return { success: true, action: 'ignored' };
  }

  const adminSupabase = createAdminSupabaseClient();

  // Find existing transaction
  const { data: existingTransaction, error: txError } = await adminSupabase
    .from('paystack_transactions')
    .select('*')
    .eq('reference', txData.reference)
    .single();

  if (txError || !existingTransaction) {
    console.warn(`[Paystack Webhook] Transaction not found for reference: ${txData.reference}`);
    // This could be a transaction initiated outside our system
    return { success: false, error: 'Transaction not found' };
  }

  // Determine status from event
  const status: PaystackTransactionStatus = eventType === 'charge.success' ? 'success' : 'failed';

  // If already processed with this status, skip
  if (
    existingTransaction.status === status &&
    (status !== 'success' || existingTransaction.payment_id)
  ) {
    console.log(`[Paystack Webhook] Transaction already processed: ${txData.reference}`);
    return { success: true, action: 'already_processed', transaction_id: existingTransaction.id };
  }

  // Update transaction record
  const updateData: Record<string, unknown> = {
    status,
    channel: txData.channel,
    gateway_response: txData.gateway_response,
    response_data: txData,
    authorization_code: txData.authorization?.authorization_code || null,
    customer_code: txData.customer?.customer_code || null,
    paid_at: txData.paid_at,
  };

  const { error: updateError } = await adminSupabase
    .from('paystack_transactions')
    .update(updateData)
    .eq('id', existingTransaction.id);

  if (updateError) {
    console.error('[Paystack Webhook] Failed to update transaction:', updateError);
    return { success: false, error: 'Failed to update transaction' };
  }

  // Process successful payment
  if (status === 'success' && !existingTransaction.payment_id) {
    const amountNaira = koboToNaira(txData.amount);

    // Create payment record
    const { data: paymentRecord, error: paymentError } = await adminSupabase
      .from('payment_records')
      .insert({
        resident_id: existingTransaction.resident_id,
        house_id: existingTransaction.house_id,
        amount: amountNaira,
        payment_date: txData.paid_at || new Date().toISOString(),
        status: 'paid',
        method: 'online',
        reference_number: txData.reference,
        paystack_reference: txData.reference,
        notes: `Online payment via ${txData.channel || 'Paystack'} (webhook)`,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('[Paystack Webhook] Failed to create payment:', paymentError);
      return { success: false, error: 'Failed to create payment record' };
    }

    // Link payment to transaction
    await adminSupabase
      .from('paystack_transactions')
      .update({ payment_id: paymentRecord.id })
      .eq('id', existingTransaction.id);

    // Credit wallet
    const creditResult = await creditWallet(
      existingTransaction.resident_id,
      amountNaira,
      'payment',
      paymentRecord.id,
      `Online payment via ${txData.channel || 'Paystack'}`
    );

    if (!creditResult.success) {
      console.error('[Paystack Webhook] Failed to credit wallet:', creditResult.error);
    }

    // Auto-allocate to invoices
    const allocateResult = await allocateWalletToInvoices(
      existingTransaction.resident_id,
      existingTransaction.house_id
    );

    if (allocateResult.success && allocateResult.invoicesPaid > 0) {
      console.log(
        `[Paystack Webhook] Auto-allocated ₦${allocateResult.totalAllocated} to ${allocateResult.invoicesPaid} invoices`
      );
    }

    // Get resident info for audit
    const { data: resident } = await adminSupabase
      .from('residents')
      .select('first_name, last_name')
      .eq('id', existingTransaction.resident_id)
      .single();

    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'payments',
      entityId: paymentRecord.id,
      entityDisplay: `Payment ₦${amountNaira.toLocaleString()} for ${resident?.first_name} ${resident?.last_name}`,
      newValues: {
        amount: amountNaira,
        method: 'online',
        channel: txData.channel,
        reference: txData.reference,
        invoice_id: existingTransaction.invoice_id,
        source: 'paystack_webhook',
      },
    });

    console.log(`[Paystack Webhook] Payment created: ${paymentRecord.id}`);

    return {
      success: true,
      action: 'payment_created',
      transaction_id: existingTransaction.id,
      payment_id: paymentRecord.id,
    };
  }

  // For failed payments or already-processed success
  return {
    success: true,
    action: 'status_updated',
    transaction_id: existingTransaction.id,
  };
}
