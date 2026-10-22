'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { InvoiceStatus } from '@/types/database';
import { revalidatePath } from 'next/cache';
import { validateMoneyAmount } from '@/lib/validators/money';
import { callWalletInvoiceRpc } from '@/lib/billing/wallet-payment-rpc';

type ReverseRpcData = {
  success?: boolean;
  error?: string;
  new_invoice_status?: string;
  new_amount_paid?: number;
  old_amount_paid?: number;
  old_status?: string;
  invoice_number?: string;
  new_wallet_balance?: number;
  old_wallet_balance?: number;
};

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
  const amountError = validateMoneyAmount(amountToReverse, { label: 'Reversal amount' });
  if (amountError) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: amountError,
    };
  }

  const supabase = await createServerSupabaseClient();

  // A credit note's credit sits in the corrected invoice's amount_paid but was never wallet
  // money, so only the rest of amount_paid can go back to the wallet (#995).
  const { data: invoice } = await supabase
    .from('invoices')
    .select('amount_paid')
    .eq('id', invoiceId)
    .single();
  if (invoice) {
    const { data: creditNotes } = await supabase
      .from('invoices')
      .select('amount_due')
      .eq('parent_invoice_id', invoiceId)
      .eq('correction_type', 'credit_note')
      .neq('status', 'void');
    const credited = (creditNotes ?? []).reduce((sum, note) => sum - Number(note.amount_due), 0);
    const reversible = Number(invoice.amount_paid) - credited;
    if (amountToReverse > reversible + 0.005) {
      return {
        success: false,
        amountReversed: 0,
        newInvoiceStatus: null,
        error: `Only ₦${Math.max(reversible, 0).toLocaleString()} of this invoice was paid; the rest is credit from a correction and cannot be refunded to the wallet`,
      };
    }
  }

  // 3. Reverse atomically: reverse_invoice_payment_allocation locks the wallet then the
  // invoice, lowers amount_paid, recomputes status, credits the wallet and writes the
  // 'invoice_reversal' ledger row in ONE database transaction (no client-side
  // read-modify-write, no compensating rollback). It re-checks billing.manage_wallets.
  const { data, error } = await callWalletInvoiceRpc(supabase, 'reverse_invoice_payment_allocation', {
    p_invoice_id: invoiceId,
    p_amount: amountToReverse,
  });
  const result = data as ReverseRpcData | null;

  if (error || !result || result.success !== true) {
    return {
      success: false,
      amountReversed: 0,
      newInvoiceStatus: null,
      error: error?.message || result?.error || 'Payment reversal failed',
    };
  }

  const newStatus = result.new_invoice_status as InvoiceStatus;
  const newWalletBalance = Number(result.new_wallet_balance);

  // 4. Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'invoices',
    entityId: invoiceId,
    entityDisplay: `Payment reversal: ${result.invoice_number}`,
    oldValues: {
      amount_paid: result.old_amount_paid,
      status: result.old_status,
      wallet_balance: result.old_wallet_balance,
    },
    newValues: {
      amount_paid: result.new_amount_paid,
      status: newStatus,
      wallet_balance: newWalletBalance,
    },
    metadata: {
      reversal_amount: amountToReverse,
      wallet_credited: true,
      reason: 'Manual payment allocation reversal',
    },
  });

  // 5. Revalidate cache
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
