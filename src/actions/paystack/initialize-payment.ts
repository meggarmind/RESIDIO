'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {
  initializeTransaction,
  generateReference,
  nairaToKobo,
  isPaystackConfigured,
} from '@/lib/paystack';
import type { InitializePaymentResult, PaystackMetadata } from '@/lib/paystack';
import { logAudit } from '@/lib/audit/logger';

// Input validation schema
const initializePaymentSchema = z.object({
  invoice_id: z.string().uuid('Invalid invoice ID'),
  callback_url: z.string().url('Invalid callback URL'),
});

type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;

/**
 * Initialize a Paystack payment for an invoice
 *
 * This creates a pending transaction record and returns the Paystack
 * authorization URL for the user to complete payment.
 */
export async function initializePaystackPayment(
  input: InitializePaymentInput
): Promise<InitializePaymentResult> {
  // Check if Paystack is configured
  if (!isPaystackConfigured()) {
    return {
      success: false,
      error: 'Online payments are not currently available. Please contact support.',
    };
  }

  // Validate input
  const validation = initializePaymentSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createServerSupabaseClient();

  // Get current user's resident record
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'You must be logged in to make a payment' };
  }

  // Get resident linked to this profile
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email, phone_primary')
    .eq('profile_id', user.id)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident account not found' };
  }

  // Get invoice details
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      resident_id,
      house_id,
      amount_due,
      amount_paid,
      status
    `)
    .eq('id', input.invoice_id)
    .single();

  if (invoiceError || !invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  // Verify this invoice belongs to the resident
  if (invoice.resident_id !== resident.id) {
    return { success: false, error: 'You can only pay your own invoices' };
  }

  // Check invoice status
  if (invoice.status === 'paid') {
    return { success: false, error: 'This invoice has already been paid' };
  }

  if (invoice.status === 'void') {
    return { success: false, error: 'This invoice has been voided' };
  }

  // Calculate remaining amount
  const remainingAmount = (invoice.amount_due || 0) - (invoice.amount_paid || 0);

  if (remainingAmount <= 0) {
    return { success: false, error: 'No outstanding balance on this invoice' };
  }

  // Get email for Paystack (prefer resident email, fall back to profile)
  const email = resident.email || user.email;
  if (!email) {
    return {
      success: false,
      error: 'No email address found. Please update your profile.',
    };
  }

  // Generate unique reference
  const reference = generateReference();

  // Prepare metadata for tracking
  const metadata: PaystackMetadata = {
    invoice_id: invoice.id,
    resident_id: resident.id,
    house_id: invoice.house_id || undefined,
    invoice_number: invoice.invoice_number,
    custom_fields: [
      {
        display_name: 'Invoice Number',
        variable_name: 'invoice_number',
        value: invoice.invoice_number,
      },
      {
        display_name: 'Resident',
        variable_name: 'resident_name',
        value: `${resident.first_name} ${resident.last_name}`,
      },
    ],
  };

  // Initialize transaction with Paystack
  const paystackResponse = await initializeTransaction({
    email,
    amount: nairaToKobo(remainingAmount),
    reference,
    callback_url: input.callback_url,
    metadata,
    channels: ['card', 'bank', 'ussd', 'bank_transfer'], // Enable all channels
    currency: 'NGN',
  });

  if (!paystackResponse.status) {
    console.error('[Paystack] Initialize failed:', paystackResponse);
    return {
      success: false,
      error: paystackResponse.message || 'Failed to initialize payment',
    };
  }

  // Create pending transaction record
  const { error: insertError } = await supabase.from('paystack_transactions').insert({
    invoice_id: invoice.id,
    resident_id: resident.id,
    house_id: invoice.house_id,
    reference,
    amount_kobo: nairaToKobo(remainingAmount),
    status: 'pending',
  });

  if (insertError) {
    console.error('[Paystack] Failed to create transaction record:', insertError);
    // Don't fail - the payment can still proceed
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'payments',
    entityId: reference,
    entityDisplay: `Paystack payment initiated for ${invoice.invoice_number}`,
    newValues: {
      amount: remainingAmount,
      reference,
      invoice_id: invoice.id,
      channel: 'paystack_redirect',
    },
  });

  return {
    success: true,
    data: {
      authorization_url: paystackResponse.data.authorization_url,
      access_code: paystackResponse.data.access_code,
      reference: paystackResponse.data.reference,
    },
  };
}
