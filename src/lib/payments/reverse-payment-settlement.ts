import type { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentBatchReversal } from '@/lib/billing/wallet-payment-rpc';

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Undo the wallet credit and invoice allocations recorded with a payment (#993).
 *
 * A payment is credited to the resident's wallet and allocated to invoices when it
 * is recorded. Deleting only the payment row would leave the invoices "paid" and
 * the wallet holding money that was never received.
 *
 * - Payment with a settlement batch: reverse_wallet_payment_batch lowers each
 *   invoice's amount_paid and removes the payment's wallet credit in one transaction. The RPC
 *   has no balance floor, so the delete is refused here when the wallet no longer holds the
 *   payment's unallocated credit.
 * - Payment kept as plain wallet credit (no eligible invoice): debit that credit.
 *   The debit fails when the credit has since been spent.
 *
 * Either way the delete is refused when that credit has been spent. Both steps are skipped once done, so a retry after a failed delete does not undo twice.
 * Callers must authorize first (deletePayment checks payments.delete); SQL and RLS re-check.
 */
export async function reversePaymentSettlement(
    supabase: SupabaseClient,
    payment: { id: string; resident_id: string | null },
    userId: string | null | undefined,
): Promise<string | null> {
    const { data: batches, error: batchError } = await supabase
        .from('wallet_payment_batches')
        .select('id, status, resident_id, charge_category')
        .eq('source_payment_id', payment.id);
    if (batchError) return batchError.message;

    if (batches && batches.length > 0) {
        for (const batch of batches.filter((b) => b.status === 'completed')) {
            const { data: wallet, error: walletError } = await supabase
                .from('resident_wallets')
                .select('balance')
                .eq('resident_id', batch.resident_id)
                .eq('charge_category', batch.charge_category)
                .single();
            if (walletError || !wallet) return walletError?.message || 'The resident wallet could not be found';
            const { data: items, error: itemsError } = await supabase
                .from('wallet_payment_batch_items')
                .select('amount_allocated')
                .eq('batch_id', batch.id);
            if (itemsError) return itemsError.message;
            const { data: credits, error: creditsError } = await supabase
                .from('wallet_transactions')
                .select('type, amount, reference_type')
                .eq('reference_id', payment.id)
                .eq('reference_type', 'payment')
                .eq('type', 'credit');
            if (creditsError) return creditsError.message;
            const allocated = (items || []).reduce((sum, i) => sum + Number(i.amount_allocated), 0);
            const sourceCredit = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);
            if (Number(wallet.balance) + allocated - sourceCredit < 0) {
                return 'Insufficient wallet balance: the unallocated credit from this payment has already been spent';
            }

            const { data, error } = await callWalletPaymentBatchReversal(supabase, {
                p_batch_id: batch.id,
                p_reversed_by: userId ?? null,
            });
            const result = data as { success?: boolean; total_reversed?: number; new_wallet_balance?: number } | null;
            if (error || !result?.success) {
                return error?.message || 'The payment allocation could not be reversed';
            }
            await logAudit({
                action: 'UPDATE',
                entityType: 'wallet_payment_batches',
                entityId: batch.id,
                entityDisplay: `Reversed wallet payment batch ${batch.id} for deleted payment`,
                newValues: {
                    status: 'reversed',
                    total_reversed: result.total_reversed,
                    new_wallet_balance: result.new_wallet_balance,
                    source_payment_id: payment.id,
                },
            });
        }
        return null;
    }

    if (!payment.resident_id) return null;

    const { data: ledger, error: ledgerError } = await supabase
        .from('wallet_transactions')
        .select('type, amount, reference_type')
        .eq('reference_id', payment.id)
        .in('reference_type', ['payment', 'payment_deletion']);
    if (ledgerError) return ledgerError.message;

    const outstanding = (ledger || []).reduce((sum, row) => {
        if (row.reference_type === 'payment' && row.type === 'credit') return sum + Number(row.amount);
        if (row.reference_type === 'payment_deletion' && row.type === 'debit') return sum - Number(row.amount);
        return sum;
    }, 0);
    if (outstanding <= 0) return null;

    const { data, error } = await supabase.rpc('adjust_wallet_debit', {
        p_resident_id: payment.resident_id,
        p_amount: outstanding,
        p_reference_type: 'payment_deletion',
        p_reference_id: payment.id,
        p_description: 'Reversal of wallet credit for deleted payment',
    });
    const result = data as { success?: boolean; wallet_id?: string; new_balance?: number } | null;
    if (error || !result?.success) {
        return error?.message || 'The wallet credit for this payment could not be reversed';
    }
    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: result.wallet_id ?? payment.resident_id,
        entityDisplay: `Wallet debit for deleted payment ${payment.id}`,
        newValues: { balance: result.new_balance, amount_debited: outstanding, reference_type: 'payment_deletion' },
    });
    return null;
}
