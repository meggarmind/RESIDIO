'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
    reconcileWalletPaymentBatch,
    type ReconciliationBatch,
    type WalletBatchFinding,
} from '@/lib/billing/wallet-batch-reconciliation';

const reconciliationInputSchema = z.object({
    residentId: z.string().uuid().optional(),
    status: z.enum(['completed', 'reversed']).optional(),
    limit: z.number().int().min(1).max(500).default(200),
});

export type WalletBatchReconciliationInput = z.input<typeof reconciliationInputSchema>;

export type WalletBatchReconciliationResult = {
    generatedAt: string;
    batchesScanned: number;
    cleanBatchCount: number;
    findings: WalletBatchFinding[];
    findingCounts: Record<string, number>;
};

function isAllocationStatus(value: string | null): 'paid' | 'partially_paid' | null {
    return value === 'paid' || value === 'partially_paid' ? value : null;
}

export async function getWalletBatchReconciliation(
    input: WalletBatchReconciliationInput = {},
): Promise<{ data: WalletBatchReconciliationResult | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const parsed = reconciliationInputSchema.safeParse(input);
    if (!parsed.success) {
        return { data: null, error: 'Invalid wallet batch reconciliation request' };
    }

    const supabase = await createServerSupabaseClient();
    let query = supabase
        .from('wallet_payment_batches')
        .select(`
            id, amount, period_start, period_end,
            wallet_payment_batch_items(
                invoice_id, amount_allocated, invoice_period_start, invoice_period_end,
                status_after, wallet_transaction_id,
                invoice_number_at_allocation, invoice_amount_due_at_allocation,
                amount_paid_before, amount_paid_after, balance_after
            )
        `)
        .order('created_at', { ascending: false })
        .limit(parsed.data.limit);

    if (parsed.data.residentId) query = query.eq('resident_id', parsed.data.residentId);
    if (parsed.data.status) query = query.eq('status', parsed.data.status);

    const { data: batches, error: batchError } = await query;
    if (batchError) return { data: null, error: batchError.message };

    const transactionIds = (batches || []).flatMap((batch) =>
        (batch.wallet_payment_batch_items || [])
            .map((item) => item.wallet_transaction_id)
            .filter((id): id is string => Boolean(id)),
    );
    const { data: transactions, error: transactionError } = transactionIds.length > 0
        ? await supabase
            .from('wallet_transactions')
            .select('id, type, amount')
            .in('id', transactionIds)
        : { data: [], error: null };

    if (transactionError) return { data: null, error: transactionError.message };

    const transactionsById = new Map((transactions || []).map((transaction) => [transaction.id, transaction]));
    const findings = (batches || []).flatMap((batch) => {
        const inputBatch: ReconciliationBatch = {
            batchId: batch.id,
            batchAmount: Number(batch.amount),
            batchPeriodStart: batch.period_start,
            batchPeriodEnd: batch.period_end,
            items: (batch.wallet_payment_batch_items || []).map((item) => ({
                invoiceId: item.invoice_id,
                amountAllocated: Number(item.amount_allocated),
                periodStart: item.invoice_period_start,
                periodEnd: item.invoice_period_end,
                statusAfter: isAllocationStatus(item.status_after),
                snapshotAvailable: item.invoice_amount_due_at_allocation != null &&
                    item.amount_paid_before != null &&
                    item.amount_paid_after != null &&
                    item.balance_after != null &&
                    item.status_after != null,
                walletTransactionId: item.wallet_transaction_id,
            })),
            walletTransactions: (batch.wallet_payment_batch_items || [])
                .map((item) => item.wallet_transaction_id ? transactionsById.get(item.wallet_transaction_id) : null)
                .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))
                .map((transaction) => ({
                    id: transaction.id,
                    type: transaction.type,
                    amount: Number(transaction.amount),
                })),
        };
        return reconcileWalletPaymentBatch(inputBatch);
    });

    const findingCounts = findings.reduce<Record<string, number>>((counts, finding) => {
        counts[finding.code] = (counts[finding.code] || 0) + 1;
        return counts;
    }, {});

    return {
        data: {
            generatedAt: new Date().toISOString(),
            batchesScanned: batches?.length || 0,
            cleanBatchCount: (batches?.length || 0) - new Set(findings.map((finding) => finding.batchId)).size,
            findings,
            findingCounts,
        },
        error: null,
    };
}
