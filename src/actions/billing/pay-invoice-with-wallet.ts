'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { validateMoneyAmount } from '@/lib/validators/money';
import { callWalletInvoiceRpc } from '@/lib/billing/wallet-payment-rpc';

type PayInvoiceResult = {
  success: boolean;
  amountPaid: number;
  newWalletBalance: number;
  invoiceFullyPaid: boolean;
  error: string | null;
};

type PayInvoiceRpcData = {
  success?: boolean;
  error?: string;
  amount_paid?: number;
  new_wallet_balance?: number;
  old_wallet_balance?: number;
  invoice_fully_paid?: boolean;
  invoice_number?: string;
  old_amount_paid?: number;
  old_status?: string;
  new_amount_paid?: number;
  new_status?: string;
};

/**
 * Pay an invoice using the resident's wallet balance (self-service)
 *
 * This action allows residents to pay their own invoices from their wallet.
 * No admin permission required - authorization is based on ownership, which the
 * `pay_invoice_with_wallet` RPC re-checks inside the database:
 * - The invoice must belong to the calling resident
 * - The wallet debited is the owning resident's
 *
 * The wallet debit, invoice update and ledger row happen in ONE database transaction
 * (wallet row locked first), so there is no client-side read-modify-write.
 *
 * Supports both full and partial payments:
 * - If wallet balance >= invoice remaining: pays in full
 * - If wallet balance < invoice remaining: pays partially
 */
export async function payInvoiceWithWallet(
  invoiceId: string,
  amount?: number
): Promise<PayInvoiceResult> {
  const fail = (error: string, extra: Partial<PayInvoiceResult> = {}): PayInvoiceResult => ({
    success: false,
    amountPaid: 0,
    newWalletBalance: 0,
    invoiceFullyPaid: false,
    error,
    ...extra,
  });

  if (amount !== undefined && validateMoneyAmount(amount, { label: 'Payment amount' })) {
    return fail('Invalid payment amount');
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return fail('Not authenticated');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('resident_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.resident_id) {
    return fail('No resident profile found');
  }

  const { data, error } = await callWalletInvoiceRpc(supabase, 'pay_invoice_with_wallet', {
    p_invoice_id: invoiceId,
    p_amount: amount ?? null,
  });
  const result = data as PayInvoiceRpcData | null;

  if (error || !result) {
    return fail(error?.message || 'Payment failed');
  }

  if (!result.success) {
    return fail(result.error || 'Payment failed', {
      newWalletBalance: result.new_wallet_balance ?? 0,
      invoiceFullyPaid: result.invoice_fully_paid ?? false,
    });
  }

  const amountToPay = Number(result.amount_paid);
  const newWalletBalance = Number(result.new_wallet_balance);

  await logAudit({
    action: 'UPDATE',
    entityType: 'invoices',
    entityId: invoiceId,
    entityDisplay: `Wallet payment for ${result.invoice_number}`,
    oldValues: {
      amount_paid: result.old_amount_paid,
      status: result.old_status,
      wallet_balance: result.old_wallet_balance,
    },
    newValues: {
      amount_paid: result.new_amount_paid,
      status: result.new_status,
      wallet_balance: newWalletBalance,
      payment_amount: amountToPay,
    },
  });

  revalidatePath('/portal/invoices');
  revalidatePath('/portal/wallet');
  revalidatePath('/portal');

  return {
    success: true,
    amountPaid: amountToPay,
    newWalletBalance,
    invoiceFullyPaid: result.invoice_fully_paid === true,
    error: null,
  };
}
