'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { getOrCreateWallet } from './wallet';

/**
 * Pay an invoice using the resident's wallet balance (self-service)
 *
 * This action allows residents to pay their own invoices from their wallet.
 * No admin permission required - authorization is based on ownership:
 * - The invoice must belong to the calling resident
 * - The wallet must belong to the calling resident
 *
 * Supports both full and partial payments:
 * - If wallet balance >= invoice remaining: pays in full
 * - If wallet balance < invoice remaining: pays partially
 */
export async function payInvoiceWithWallet(
  invoiceId: string,
  amount?: number
): Promise<{
  success: boolean;
  amountPaid: number;
  newWalletBalance: number;
  invoiceFullyPaid: boolean;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get the current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: false,
      error: 'Not authenticated'
    };
  }

  // Get the resident profile for the current user
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('resident_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.resident_id) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: false,
      error: 'No resident profile found'
    };
  }

  const residentId = profile.resident_id;

  // Get the invoice and verify ownership
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount_due, amount_paid, status, resident_id, house_id')
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: false,
      error: 'Invoice not found'
    };
  }

  // Verify the invoice belongs to this resident
  if (invoice.resident_id !== residentId) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: false,
      error: 'Invoice does not belong to you'
    };
  }

  // Check if invoice is already paid
  const remainingDue = invoice.amount_due - invoice.amount_paid;
  if (remainingDue <= 0) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: true,
      error: 'Invoice is already fully paid'
    };
  }

  // Get the resident's wallet
  const { data: wallet, error: walletError } = await getOrCreateWallet(residentId);
  if (walletError || !wallet) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: 0,
      invoiceFullyPaid: false,
      error: walletError || 'Failed to access wallet'
    };
  }

  // Check wallet balance
  if (wallet.balance <= 0) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: wallet.balance,
      invoiceFullyPaid: false,
      error: 'Insufficient wallet balance'
    };
  }

  // Calculate payment amount
  let amountToPay = Math.min(wallet.balance, remainingDue);

  // If custom amount is provided, validate it
  if (amount !== undefined) {
    if (amount <= 0) {
      return {
        success: false,
        amountPaid: 0,
        newWalletBalance: wallet.balance,
        invoiceFullyPaid: false,
        error: 'Invalid payment amount'
      };
    }
    if (amount > wallet.balance) {
      return {
        success: false,
        amountPaid: 0,
        newWalletBalance: wallet.balance,
        invoiceFullyPaid: false,
        error: 'Insufficient wallet balance for this amount'
      };
    }
    if (amount > remainingDue) {
      return {
        success: false,
        amountPaid: 0,
        newWalletBalance: wallet.balance,
        invoiceFullyPaid: false,
        error: 'Payment amount exceeds remaining due'
      }
    }
    amountToPay = amount;
  }

  const newWalletBalance = wallet.balance - amountToPay;
  const newAmountPaid = invoice.amount_paid + amountToPay;
  // Use a small epsilon for float comparison safety, though currency should be integer kobo ideally.
  // Assuming inputs are standard currency units.
  const invoiceFullyPaid = newAmountPaid >= invoice.amount_due;
  const newStatus = invoiceFullyPaid ? 'paid' : 'partially_paid';

  // Update wallet balance
  const { error: walletUpdateError } = await supabase
    .from('resident_wallets')
    .update({ balance: newWalletBalance })
    .eq('id', wallet.id);

  if (walletUpdateError) {
    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: wallet.balance,
      invoiceFullyPaid: false,
      error: `Failed to update wallet: ${walletUpdateError.message}`
    };
  }

  // Update invoice
  const { error: invoiceUpdateError } = await supabase
    .from('invoices')
    .update({
      amount_paid: newAmountPaid,
      status: newStatus
    })
    .eq('id', invoiceId);

  if (invoiceUpdateError) {
    // Rollback wallet update
    await supabase
      .from('resident_wallets')
      .update({ balance: wallet.balance })
      .eq('id', wallet.id);

    return {
      success: false,
      amountPaid: 0,
      newWalletBalance: wallet.balance,
      invoiceFullyPaid: false,
      error: `Failed to update invoice: ${invoiceUpdateError.message}`
    };
  }

  // Log wallet transaction
  await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: wallet.id,
      type: 'debit',
      amount: amountToPay,
      balance_after: newWalletBalance,
      reference_type: 'invoice',
      reference_id: invoiceId,
      description: `Payment for ${invoice.invoice_number}`,
    });

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'invoices',
    entityId: invoiceId,
    entityDisplay: `Wallet payment for ${invoice.invoice_number}`,
    oldValues: {
      amount_paid: invoice.amount_paid,
      status: invoice.status,
      wallet_balance: wallet.balance
    },
    newValues: {
      amount_paid: newAmountPaid,
      status: newStatus,
      wallet_balance: newWalletBalance,
      payment_amount: amountToPay
    },
  });

  // Revalidate relevant paths
  revalidatePath('/portal/invoices');
  revalidatePath('/portal/wallet');
  revalidatePath('/portal');

  return {
    success: true,
    amountPaid: amountToPay,
    newWalletBalance,
    invoiceFullyPaid,
    error: null
  };
}
