'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getOrCreateWallet } from './wallet';
import type { InvoiceStatus } from '@/types/database';
import { revalidatePath } from 'next/cache';

interface ReverseAllocationResult {
  success: boolean;
  amountReversed: number;
  newInvoiceStatus: InvoiceStatus | null;
  newWalletBalance?: number;
  error?: string;
}

/**
 * Reverse payment allocation on an invoice
 *
 * This action:
 * 1. Reduces invoice amount_paid by specified amount
 * 2. Updates invoice status (paid → partially_paid or unpaid)
 * 3. Credits the amount back to resident's wallet
 * 4. Creates wallet transaction record
 * 5. Logs audit trail
 *
 * Use case: Required before creating corrections on partially paid invoices
 *
 * @example
 * // Reverse full payment to allow correction
 * await reversePaymentAllocation('invoice-uuid', 25000)
 *
 * @example
 * // Partial reversal (if only part needs correction)
 * await reversePaymentAllocation('invoice-uuid', 5000)
 */
export async function reversePaymentAllocation(
  invoiceId: string,
  amountToReverse: number
): Promise<ReverseAllocationResult> {
  // 1. Authorization check
  const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
  if (!auth.authorized) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: auth.error || 'Unauthorized to reverse payment allocations',
    };
  }

  // 2. Validate amount
  if (amountToReverse <= 0) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: 'Reversal amount must be greater than zero',
    };
  }

  const supabase = await createServerSupabaseClient();

  // 3. Fetch invoice
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (fetchError || !invoice) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: 'Invoice not found',
    };
  }

  // 4. Validate amount to reverse doesn't exceed amount paid
  if (invoice.amount_paid < amountToReverse) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: `Cannot reverse ₦${amountToReverse.toLocaleString()}. Only ₦${invoice.amount_paid.toLocaleString()} has been paid on this invoice.`,
    };
  }

  // 5. Calculate new invoice state
  const newAmountPaid = invoice.amount_paid - amountToReverse;
  const newStatus: InvoiceStatus =
    newAmountPaid === 0
      ? 'unpaid'
      : newAmountPaid >= invoice.amount_due
      ? 'paid'
      : 'partially_paid';

  // 6. Update invoice (reduce amount_paid, update status)
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
    })
    .eq('id', invoiceId);

  if (updateError) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: `Failed to update invoice: ${updateError.message}`,
    };
  }

  // 7. Credit wallet (add reversed amount back)
  const { data: wallet } = await getOrCreateWallet(invoice.resident_id);
  if (!wallet) {
    // Rollback invoice update
    await supabase
      .from('invoices')
      .update({
        amount_paid: invoice.amount_paid,
        status: invoice.status,
      })
      .eq('id', invoiceId);

    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: 'Failed to get resident wallet',
    };
  }

  const newWalletBalance = wallet.balance + amountToReverse;

  const { error: walletUpdateError } = await supabase
    .from('resident_wallets')
    .update({ balance: newWalletBalance })
    .eq('id', wallet.id);

  if (walletUpdateError) {
    // Rollback invoice update
    await supabase
      .from('invoices')
      .update({
        amount_paid: invoice.amount_paid,
        status: invoice.status,
      })
      .eq('id', invoiceId);

    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: `Failed to credit wallet: ${walletUpdateError.message}`,
    };
  }

  // 8. Log wallet transaction
  await supabase.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    type: 'credit',
    amount: amountToReverse,
    balance_after: newWalletBalance,
    reference_type: 'invoice_reversal',
    reference_id: invoiceId,
    description: `Payment reversal for invoice ${invoice.invoice_number}`,
  });

  // 9. Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'invoices',
    entityId: invoiceId,
    entityDisplay: `Payment reversal: ${invoice.invoice_number}`,
    oldValues: {
      amount_paid: invoice.amount_paid,
      status: invoice.status,
      wallet_balance: wallet.balance,
    },
    newValues: {
      amount_paid: newAmountPaid,
      status: newStatus,
      wallet_balance: newWalletBalance,
    },
    metadata: {
      reversal_amount: amountToReverse,
      wallet_credited: true,
      reason: 'Manual payment allocation reversal',
    },
  });

  // 10. Revalidate cache
  revalidatePath('/billing');
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath('/residents');

  return {
    success: true,
    amountReversed: amountToReverse,
    newInvoiceStatus: newStatus,
    newWalletBalance,
  };
}
