'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { PaymentReceiptAllocation } from '@/lib/billing/payment-period';

type WalletPaymentBatchItemRecord = {
    invoice_id: string;
    invoice_number_at_allocation: string | null;
    invoice_period_start: string;
    invoice_period_end: string;
    amount_allocated: number;
    invoice_amount_due_at_allocation: number | null;
    amount_paid_before: number | null;
    amount_paid_after: number | null;
    balance_after: number | null;
    status_after: 'paid' | 'partially_paid' | null;
};

type WalletPaymentBatchListRecord = {
    id: string;
    receipt_number: string;
    batch_type: string;
    amount: number;
    payment_date: string;
    period_start: string | null;
    period_end: string | null;
    status: string;
    wallet_payment_batch_items?: Array<Partial<WalletPaymentBatchItemRecord>>;
};

function mapAllocation(item: WalletPaymentBatchItemRecord): PaymentReceiptAllocation | null {
    if (
        item.invoice_amount_due_at_allocation == null ||
        item.amount_paid_before == null ||
        item.amount_paid_after == null ||
        item.balance_after == null ||
        item.status_after == null
    ) {
        return null;
    }

    return {
        invoiceId: item.invoice_id,
        invoiceNumber: item.invoice_number_at_allocation,
        periodStart: item.invoice_period_start,
        periodEnd: item.invoice_period_end,
        amountAllocated: Number(item.amount_allocated),
        invoiceAmountDue: Number(item.invoice_amount_due_at_allocation),
        amountPaidBefore: Number(item.amount_paid_before),
        amountPaidAfter: Number(item.amount_paid_after),
        balanceAfter: Number(item.balance_after),
        statusAfter: item.status_after,
    };
}

export async function getWalletPaymentBatch(batchId: string) {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();
    // The batch query includes a nested compatibility projection used by the receipt history.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from('wallet_payment_batches')
        .select(`
            id, receipt_number, amount, payment_date, period_start, period_end, status,
            wallet_payment_batch_items(
                invoice_id, invoice_number_at_allocation, invoice_period_start, invoice_period_end,
                amount_allocated, invoice_amount_due_at_allocation, amount_paid_before,
                amount_paid_after, balance_after, status_after
            ),
            resident:residents(id, first_name, last_name, resident_code, phone_primary, email),
            house:houses(house_number, short_name, street:streets(name))
        `)
        .eq('id', batchId)
        .single();

    if (error) return { data: null, error: error.message };

    const rawItems = (data?.wallet_payment_batch_items || []) as WalletPaymentBatchItemRecord[];
    const allocations = rawItems.map(mapAllocation).filter((item): item is PaymentReceiptAllocation => item !== null);

    return {
        data: data ? {
            ...data,
            method: 'wallet',
            status: data.status === 'completed' ? 'paid' : data.status,
            reference_number: data.receipt_number,
            created_at: new Date().toISOString(),
            allocations,
            allocation_count: rawItems.length,
            allocation_snapshot_available: rawItems.length > 0 && allocations.length === rawItems.length,
            partial_allocation_count: allocations.filter((item) => item.statusAfter === 'partially_paid').length,
        } : null,
        error: null,
    };
}

export async function getWalletPaymentBatches(residentId: string) {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) return { data: [], error: auth.error || 'Unauthorized' };

    const supabase = await createServerSupabaseClient();
    // The generated database types predate the additive batch tables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
        .from('wallet_payment_batches')
        .select(`
            id, receipt_number, batch_type, amount, payment_date, period_start, period_end, status,
            wallet_payment_batch_items(
                amount_allocated, invoice_period_start, invoice_period_end,
                invoice_amount_due_at_allocation, amount_paid_before, amount_paid_after,
                balance_after, status_after
            )
        `)
        .eq('resident_id', residentId)
        .order('payment_date', { ascending: false })
        .limit(20);

    const batches = ((data || []) as WalletPaymentBatchListRecord[]).map((batch) => {
        const items = batch.wallet_payment_batch_items || [];
        const hasSnapshots = items.length > 0 && items.every((item) =>
            item.invoice_amount_due_at_allocation != null &&
            item.amount_paid_before != null &&
            item.amount_paid_after != null &&
            item.balance_after != null &&
            item.status_after != null
        );
        return {
            ...batch,
            wallet_payment_batch_items: [{ count: items.length }],
            allocation_snapshot_available: hasSnapshots,
            partial_allocation_count: hasSnapshots
                ? items.filter((item) => item.status_after === 'partially_paid').length
                : null,
        };
    });

    return { data: batches, error: error?.message || null };
}
