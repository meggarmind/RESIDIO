'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { verifyTransaction, koboToNaira, isPaystackConfigured } from '@/lib/paystack';
import type { VerifyPaymentResult, PaystackTransactionStatus } from '@/lib/paystack';
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet';
import { logAudit } from '@/lib/audit/logger';

// Input validation
const verifyPaymentSchema = z.object({
  reference: z.string().min(1, 'Reference is required'),
});

/**
 * Verify a Paystack payment and process it if successful
 *
 * This is called when the user returns from Paystack's payment page
 * or can be used to manually verify a transaction.
 */
export async function verifyPaystackPayment(
  reference: string
): Promise<VerifyPaymentResult> {
  // Check if Paystack is configured
  if (!isPaystackConfigured()) {
    return {
      success: false,
      error: 'Online payments are not configured',
    };
  }

  // Validate input
  const validation = verifyPaymentSchema.safeParse({ reference });
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.errors[0]?.message || 'Invalid reference',
    };
  }

  const supabase = await createServerSupabaseClient();

  // Check if transaction exists in our database
  const { data: existingTransaction, error: txError } = await supabase
    .from('paystack_transactions')
    .select('*')
    .eq('reference', reference)
    .single();

  if (txError || !existingTransaction) {
    return {
      success: false,
      error: 'Transaction not found',
    };
  }

  // If already processed successfully, return success
  if (existingTransaction.status === 'success' && existingTransaction.payment_id) {
    return {
      success: true,
      data: {
        status: 'success',
        reference,
        amount: koboToNaira(existingTransaction.amount_kobo),
        paid_at: existingTransaction.paid_at,
        channel: existingTransaction.channel,
        invoice_id: existingTransaction.invoice_id,
      },
    };
  }

  // Verify with Paystack
  const paystackResponse = await verifyTransaction(reference);

  if (!paystackResponse.status) {
    console.error('[Paystack] Verify failed:', paystackResponse);
    return {
      success: false,
      error: paystackResponse.message || 'Failed to verify payment',
    };
  }

  const txData = paystackResponse.data;
  const status = txData.status as PaystackTransactionStatus;

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

  // Use admin client for the update to bypass RLS during payment processing
  const adminSupabase = createAdminSupabaseClient();

  const { error: updateError } = await adminSupabase
    .from('paystack_transactions')
    .update(updateData)
    .eq('id', existingTransaction.id);

  if (updateError) {
    console.error('[Paystack] Failed to update transaction:', updateError);
  }

  // If payment was successful, create payment record and allocate
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
        reference_number: reference,
        paystack_reference: reference,
        notes: `Online payment via ${txData.channel || 'Paystack'}`,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('[Paystack] Failed to create payment record:', paymentError);
      return {
        success: false,
        error: 'Payment verified but failed to record. Please contact support.',
      };
    }

    // Update transaction with payment_id
    await adminSupabase
      .from('paystack_transactions')
      .update({ payment_id: paymentRecord.id })
      .eq('id', existingTransaction.id);

    // Credit wallet and allocate to invoices
    const creditResult = await creditWallet(
      existingTransaction.resident_id,
      amountNaira,
      'payment',
      paymentRecord.id,
      `Online payment via ${txData.channel || 'Paystack'}`
    );

    if (!creditResult.success) {
      console.error('[Paystack] Failed to credit wallet:', creditResult.error);
    }

    // Auto-allocate to invoices (prioritize the invoice this payment was for)
    const allocateResult = await allocateWalletToInvoices(
      existingTransaction.resident_id,
      existingTransaction.house_id
    );

    if (allocateResult.success && allocateResult.invoicesPaid > 0) {
      console.log(
        `[Paystack] Auto-allocated ₦${allocateResult.totalAllocated} to ${allocateResult.invoicesPaid} invoices`
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
        reference,
        invoice_id: existingTransaction.invoice_id,
        paystack_verified: true,
      },
    });

    return {
      success: true,
      data: {
        status: 'success',
        reference,
        amount: amountNaira,
        paid_at: txData.paid_at,
        channel: txData.channel,
        invoice_id: existingTransaction.invoice_id,
      },
    };
  }

  // Return current status for non-success states
  return {
    success: status !== 'failed' && status !== 'abandoned',
    data: {
      status,
      reference,
      amount: koboToNaira(txData.amount),
      paid_at: txData.paid_at,
      channel: txData.channel,
      invoice_id: existingTransaction.invoice_id,
    },
    error: status === 'failed' ? 'Payment failed' : status === 'abandoned' ? 'Payment was abandoned' : undefined,
  };
}

/**
 * Get transaction status without full verification
 * Used for checking status of pending payments
 */
export async function getPaystackTransactionStatus(reference: string): Promise<{
  success: boolean;
  status?: PaystackTransactionStatus;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('paystack_transactions')
    .select('status')
    .eq('reference', reference)
    .single();

  if (error || !data) {
    return { success: false, error: 'Transaction not found' };
  }

  return {
    success: true,
    status: data.status as PaystackTransactionStatus,
  };
}
