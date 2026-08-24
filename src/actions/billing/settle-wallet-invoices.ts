'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';

const settleWalletInvoicesSchema = z.object({
    residentId: z.string().uuid(),
    invoiceIds: z.array(z.string().uuid()).min(1),
    houseId: z.string().uuid().nullable().optional(),
    paymentDate: z.string().date().optional(),
    requestKey: z.string().uuid(),
});

export type SettleWalletInvoicesInput = z.infer<typeof settleWalletInvoicesSchema>;

export async function getResidentWalletBalance(residentId: string) {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { balance: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('resident_wallets')
        .select('balance')
        .eq('resident_id', residentId)
        .maybeSingle();

    return {
        balance: data ? Number(data.balance) : 0,
        error: error?.message || null,
    };
}

export type SettleWalletInvoicesResult = {
    success: boolean;
    batchId?: string;
    receiptNumber?: string;
    invoicesPaid?: number;
    fullyPaidCount?: number;
    partialCount?: number;
    totalAllocated?: number;
    remainingOutstanding?: number;
    periodStart?: string;
    periodEnd?: string;
    error?: string;
};

export async function getResidentPayableInvoices(residentId: string) {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: [], error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, house_id, amount_due, amount_paid, status, period_start, period_end, due_date')
        .eq('resident_id', residentId)
        .in('status', ['unpaid', 'partially_paid'])
        .gt('amount_due', 0)
        .order('period_start', { ascending: true });

    return { data: data || [], error: error?.message || null };
}

/**
 * Settle a selected, resident-scoped set of pending invoices from an existing
 * wallet balance. The database RPC locks the wallet and invoices together so
 * concurrent admin actions cannot double-allocate funds.
 */
export async function settleWalletInvoices(
    input: SettleWalletInvoicesInput,
): Promise<SettleWalletInvoicesResult> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const parsed = settleWalletInvoicesSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: 'Invalid invoice settlement request' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: invoices, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, resident_id, house_id, status, amount_due, amount_paid, period_start, period_end')
        .eq('resident_id', parsed.data.residentId)
        .in('id', parsed.data.invoiceIds);

    if (invoiceError) {
        return { success: false, error: invoiceError.message };
    }
    if (!invoices || invoices.length !== new Set(parsed.data.invoiceIds).size) {
        return { success: false, error: 'One or more invoices are not available for this resident' };
    }
    if (invoices.some((invoice) => !['unpaid', 'partially_paid'].includes(invoice.status))) {
        return { success: false, error: 'Only unpaid or partially paid invoices can be settled' };
    }

    const orderedInvoiceIds = [...parsed.data.invoiceIds].sort((a, b) => {
        const invoiceA = invoices.find((invoice) => invoice.id === a);
        const invoiceB = invoices.find((invoice) => invoice.id === b);
        return (invoiceA?.period_start || '').localeCompare(invoiceB?.period_start || '');
    });
    const paymentDate = parsed.data.paymentDate || new Date().toISOString().slice(0, 10);

    const { data, error } = await callWalletPaymentRpc(supabase, {
        p_request_key: parsed.data.requestKey,
        p_resident_id: parsed.data.residentId,
        p_invoice_ids: orderedInvoiceIds,
        p_batch_type: 'existing_wallet_settlement',
        p_payment_date: paymentDate,
        p_source_payment_id: null,
        p_house_id: parsed.data.houseId || null,
        p_credit_amount: 0,
        p_batch_amount: null,
        p_created_by: auth.userId,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    const result = data as {
        success?: boolean;
        batch_id?: string;
        receipt_number?: string;
        total_allocated?: number;
        period_start?: string;
        period_end?: string;
        allocations?: Array<{
            status_after?: 'paid' | 'partially_paid';
            balance_after?: number;
        }>;
        existing?: boolean;
    } | null;
    if (!result?.success || !result.batch_id) {
        return { success: false, error: 'No invoices were settled from the wallet' };
    }

    const allocations = result.allocations || [];
    const fullyPaidCount = allocations.filter((allocation) => allocation.status_after === 'paid').length;
    const partialCount = allocations.filter((allocation) => allocation.status_after === 'partially_paid').length;
    const remainingOutstanding = allocations.reduce(
        (total, allocation) => total + Number(allocation.balance_after || 0),
        0,
    );

    if (!result.existing) await logAudit({
        action: 'ALLOCATE',
        entityType: 'wallet_payment_batches',
        entityId: result.batch_id,
        entityDisplay: `Wallet settlement for resident ${parsed.data.residentId}`,
        newValues: {
            invoice_ids: orderedInvoiceIds,
            fully_paid_count: fullyPaidCount,
            partial_count: partialCount,
            remaining_outstanding: remainingOutstanding,
            total_allocated: result.total_allocated,
            receipt_number: result.receipt_number,
            period_start: result.period_start,
            period_end: result.period_end,
        },
    });

    revalidatePath('/billing');
    revalidatePath('/residents');
    revalidatePath(`/residents/${parsed.data.residentId}`);

    return {
        success: true,
        batchId: result.batch_id,
        receiptNumber: result.receipt_number,
        invoicesPaid: allocations.length,
        fullyPaidCount,
        partialCount,
        totalAllocated: Number(result.total_allocated || 0),
        remainingOutstanding,
        periodStart: result.period_start,
        periodEnd: result.period_end,
    };
}
