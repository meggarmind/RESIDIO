import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';
import { eligibleSettlementInvoiceIds } from '@/lib/billing/eligible-invoices';
import { recordAudit, type AuditActor } from '@/lib/audit/recorder';

/**
 * Credit a new payment to the resident's wallet and settle its eligible invoices in one RPC.
 *
 * NOT a server action (no 'use server'). `allocateWalletToInvoices` uses it with the session
 * client and the permission-checked `creditWallet`; the session-free payment path (#1340) uses
 * it with the service-role client and `creditWalletAsService`, so both allocate the same way.
 */
export type SettlementResult = {
    success: boolean;
    invoicesPaid: number;
    totalAllocated: number;
    error: string | null;
    batchId?: string;
    receiptNumber?: string;
};

export type SettlementBatch = {
    sourcePaymentId?: string | null;
    batchAmount?: number | null;
    batchType?: 'payment_received' | 'existing_wallet_settlement' | 'future_prepayment';
    creditAmount?: number | null;
};

export async function settlePaymentBatch(
    client: unknown,
    params: { residentId: string; houseId?: string | null; paymentDate?: string; chargeCategory: string },
    batch: SettlementBatch,
    credit: (amount: number) => Promise<{ success: boolean; error: string | null }>,
): Promise<SettlementResult> {
    const { residentId, houseId, chargeCategory } = params;
    const settlementDate = params.paymentDate || new Date().toISOString().slice(0, 10);
    const eligible = await eligibleSettlementInvoiceIds(client, { residentId, houseId, chargeCategory, settlementDate });
    if (eligible.error) return { success: false, invoicesPaid: 0, totalAllocated: 0, error: eligible.error };
    const invoiceIds = eligible.ids;

    if (invoiceIds.length === 0) {
        if (Number(batch.creditAmount || 0) > 0) {
            const result = await credit(Number(batch.creditAmount));
            return { success: result.success, invoicesPaid: 0, totalAllocated: 0, error: result.error };
        }
        return { success: true, invoicesPaid: 0, totalAllocated: 0, error: null };
    }

    const rpcResult = await callWalletPaymentRpc(client, {
        p_resident_id: residentId,
        p_invoice_ids: invoiceIds,
        p_batch_type: batch.batchType || 'payment_received',
        p_payment_date: settlementDate,
        p_source_payment_id: batch.sourcePaymentId || null,
        p_house_id: houseId || null,
        p_credit_amount: Number(batch.creditAmount || 0),
        p_batch_amount: batch.batchAmount == null ? null : Number(batch.batchAmount),
        p_charge_category: chargeCategory,
    });
    if (rpcResult.error) return { success: false, invoicesPaid: 0, totalAllocated: 0, error: rpcResult.error.message };

    const data = (rpcResult.data || {}) as {
        success?: boolean;
        batch_id?: string;
        receipt_number?: string;
        total_allocated?: number;
        allocations?: Array<{ status_after?: string }>;
    };
    const allocations = data.allocations || [];
    return {
        success: data.success !== false,
        invoicesPaid: allocations.filter((allocation) => allocation.status_after === 'paid').length,
        totalAllocated: Number(data.total_allocated || 0),
        error: data.success === false ? 'Wallet settlement failed' : null,
        batchId: data.batch_id,
        receiptNumber: data.receipt_number,
    };
}

type RpcClient = {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
        data: { success?: boolean; new_balance?: number; wallet_id?: string } | null;
        error: { message: string } | null;
    }>;
};

/**
 * The service-role twin of `creditWallet` for a payment credit: the same `adjust_wallet_credit`
 * RPC (it accepts the service role) and a wallet audit entry with the system actor.
 */
export async function creditWalletAsService(
    client: unknown,
    params: { residentId: string; amount: number; paymentId?: string | null; description: string; chargeCategory: string },
    actor: AuditActor,
): Promise<{ success: boolean; error: string | null }> {
    const { data, error } = await (client as RpcClient).rpc('adjust_wallet_credit', {
        p_resident_id: params.residentId,
        p_amount: params.amount,
        p_reference_type: 'payment',
        p_reference_id: params.paymentId || null,
        p_description: params.description,
        p_charge_category: params.chargeCategory,
    });

    if (error || !data || data.success !== true || typeof data.new_balance !== 'number' || !data.wallet_id) {
        return { success: false, error: error?.message || 'Wallet credit failed' };
    }

    await recordAudit(
        {
            action: 'UPDATE',
            entityType: 'wallets',
            entityId: data.wallet_id,
            entityDisplay: `Wallet credit for resident ${params.residentId}`,
            oldValues: { balance: data.new_balance - params.amount },
            newValues: {
                balance: data.new_balance,
                amount_credited: params.amount,
                reference_type: 'payment',
                charge_category: params.chargeCategory,
            },
        },
        actor,
    );
    return { success: true, error: null };
}
