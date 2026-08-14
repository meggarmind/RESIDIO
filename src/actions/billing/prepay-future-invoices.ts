'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { RateSnapshot } from '@/types/database';
import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';

const futurePrepaymentSchema = z.object({
    residentId: z.string().uuid(),
    houseId: z.string().uuid(),
    startMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
    endMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
    paymentDate: z.string().date().optional(),
    method: z.enum(['cash', 'bank_transfer', 'pos', 'cheque', 'online']).default('bank_transfer'),
    referenceNumber: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
});

export type FuturePrepaymentInput = z.infer<typeof futurePrepaymentSchema>;

export type FuturePrepaymentResult = {
    success: boolean;
    batchId?: string;
    receiptNumber?: string;
    invoicesCreated?: number;
    invoicesPaid?: number;
    totalAmount?: number;
    periodStart?: string;
    periodEnd?: string;
    error?: string;
};

function addMonth(month: string): string {
    const date = new Date(`${month}T00:00:00`);
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(month: string): string {
    const date = new Date(`${month}T00:00:00`);
    date.setMonth(date.getMonth() + 1, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Create and immediately settle monthly invoices for a future range. The
 * resulting batch is the single receipt for the range; the wallet ledger still
 * records the credit and each invoice debit separately.
 */
export async function prepayFutureInvoices(
    input: FuturePrepaymentInput,
): Promise<FuturePrepaymentResult> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) {
        return { success: false, error: auth.error || 'Unauthorized' };
    }

    const parsed = futurePrepaymentSchema.safeParse(input);
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    if (!parsed.success || parsed.data.startMonth > parsed.data.endMonth || parsed.data.startMonth <= currentMonth) {
        return { success: false, error: 'Select a valid future month range' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: residentHouse, error: residentHouseError } = await supabase
        .from('resident_houses')
        .select('resident_id, house_id, resident_role, move_in_date')
        .eq('resident_id', parsed.data.residentId)
        .eq('house_id', parsed.data.houseId)
        .eq('is_active', true)
        .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant'])
        .maybeSingle();

    if (residentHouseError || !residentHouse) {
        return { success: false, error: residentHouseError?.message || 'Resident is not assigned to this house' };
    }

    const { data: house, error: houseError } = await supabase
        .from('houses')
        .select('id, house_number, billing_profile_id, house_type_id')
        .eq('id', parsed.data.houseId)
        .single();
    if (houseError || !house) {
        return { success: false, error: houseError?.message || 'House not found' };
    }

    let billingProfile: {
        id: string;
        name: string;
        is_one_time: boolean;
        billing_items: Array<{ id: string; name: string; amount: number; frequency: string; is_mandatory: boolean }>;
    } | null = null;
    if (house.billing_profile_id) {
        const { data } = await supabase
            .from('billing_profiles')
            .select('id, name, is_one_time, billing_items(id, name, amount, frequency, is_mandatory)')
            .eq('id', house.billing_profile_id)
            .eq('is_active', true)
            .single();
        billingProfile = data;
    } else if (house.house_type_id) {
        const { data } = await supabase
            .from('house_types')
            .select('billing_profile:billing_profiles(id, name, is_one_time, billing_items(id, name, amount, frequency, is_mandatory))')
            .eq('id', house.house_type_id)
            .single();
        billingProfile = (Array.isArray(data?.billing_profile) ? data?.billing_profile[0] : data?.billing_profile) ?? null;
    }

    const monthlyItems = (billingProfile?.billing_items || []).filter((item: { frequency: string }) => item.frequency === 'monthly');
    const monthlyTotal = monthlyItems.reduce((sum: number, item: { amount: number }) => sum + Number(item.amount || 0), 0);
    if (!billingProfile || monthlyItems.length === 0 || monthlyTotal <= 0) {
        return { success: false, error: 'This house has no active monthly billing profile' };
    }

    const months: string[] = [];
    for (let month = parsed.data.startMonth; month <= parsed.data.endMonth; month = addMonth(month)) {
        months.push(month);
        if (months.length > 24) {
            return { success: false, error: 'Future prepayment is limited to 24 months per request' };
        }
    }

    const { data: existingInvoices, error: existingError } = await supabase
        .from('invoices')
        .select('id, amount_due, amount_paid, status, period_start, period_end')
        .eq('resident_id', parsed.data.residentId)
        .eq('house_id', parsed.data.houseId)
        .gte('period_start', parsed.data.startMonth)
        .lte('period_start', parsed.data.endMonth);
    if (existingError) {
        return { success: false, error: existingError.message };
    }

    const existingByMonth = new Map((existingInvoices || []).map((invoice) => [invoice.period_start, invoice]));
    const invoiceIds: string[] = [];
    let invoicesCreated = 0;

    for (const month of months) {
        const existing = existingByMonth.get(month);
        if (existing) {
            if (['unpaid', 'partially_paid'].includes(existing.status) && Number(existing.amount_due) > Number(existing.amount_paid)) {
                invoiceIds.push(existing.id);
            }
            continue;
        }

        const year = month.slice(0, 4);
        const monthNumber = month.slice(5, 7);
        const periodEnd = monthEnd(month);
        const rateSnapshot: RateSnapshot = {
            billing_profile_id: billingProfile.id,
            billing_profile_name: billingProfile.name,
            captured_at: new Date().toISOString(),
            items: monthlyItems.map((item: { name: string; amount: number; frequency: string; is_mandatory: boolean }) => ({
                name: item.name,
                amount: Number(item.amount),
                frequency: item.frequency,
                is_mandatory: item.is_mandatory,
            })),
            total_amount: monthlyTotal,
        };

        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .insert({
                resident_id: parsed.data.residentId,
                house_id: parsed.data.houseId,
                billing_profile_id: billingProfile.id,
                invoice_number: `INV-${year}${monthNumber}-${house.id.substring(0, 8).toUpperCase()}`,
                amount_due: monthlyTotal,
                amount_paid: 0,
                status: 'unpaid',
                invoice_type: billingProfile.is_one_time ? 'LEVY' : 'SERVICE_CHARGE',
                rate_snapshot: rateSnapshot,
                due_date: month,
                period_start: month,
                period_end: periodEnd,
                created_by: auth.userId,
            })
            .select('id')
            .single();

        if (invoiceError || !invoice) {
            return { success: false, error: invoiceError?.message || `Could not create invoice for ${month}` };
        }

        const { error: itemsError } = await supabase.from('invoice_items').insert(
            monthlyItems.map((item: { name: string; amount: number }) => ({
                invoice_id: invoice.id,
                description: item.name,
                amount: Number(item.amount),
            })),
        );
        if (itemsError) {
            return { success: false, error: itemsError.message };
        }

        invoiceIds.push(invoice.id);
        invoicesCreated++;
    }

    if (invoiceIds.length === 0) {
        return { success: false, error: 'All selected months are already paid' };
    }

    const totalAmount = invoiceIds.reduce((sum, id) => {
        const existing = (existingInvoices || []).find((invoice) => invoice.id === id);
        return sum + (existing ? Number(existing.amount_due) - Number(existing.amount_paid) : monthlyTotal);
    }, 0);

    const { data: sourcePayment, error: sourcePaymentError } = await supabase
        .from('payment_records')
        .insert({
            resident_id: parsed.data.residentId,
            house_id: parsed.data.houseId,
            amount: totalAmount,
            payment_date: parsed.data.paymentDate || new Date().toISOString().slice(0, 10),
            status: 'pending',
            method: parsed.data.method,
            reference_number: parsed.data.referenceNumber || null,
            notes: parsed.data.notes || 'Future-month prepayment',
            period_start: parsed.data.startMonth,
            period_end: monthEnd(parsed.data.endMonth),
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: auth.userId,
        })
        .select('id')
        .single();
    if (sourcePaymentError || !sourcePayment) {
        return { success: false, error: sourcePaymentError?.message || 'Could not create the prepayment record' };
    }

    const { data, error } = await callWalletPaymentRpc(supabase, {
        p_resident_id: parsed.data.residentId,
        p_invoice_ids: invoiceIds,
        p_batch_type: 'future_prepayment',
        p_payment_date: parsed.data.paymentDate || new Date().toISOString().slice(0, 10),
        p_source_payment_id: sourcePayment.id,
        p_house_id: parsed.data.houseId,
        p_credit_amount: totalAmount,
        p_batch_amount: totalAmount,
        p_created_by: auth.userId,
    });
    if (error) {
        await supabase.from('payment_records').update({ status: 'failed' }).eq('id', sourcePayment.id);
        return { success: false, error: error.message };
    }

    const result = data as {
        success?: boolean;
        batch_id?: string;
        receipt_number?: string;
        total_allocated?: number;
        period_start?: string;
        period_end?: string;
        allocations?: unknown[];
    } | null;
    if (!result?.success || !result.batch_id) {
        await supabase.from('payment_records').update({ status: 'failed' }).eq('id', sourcePayment.id);
        return { success: false, error: 'Future invoices were created but could not be settled from the wallet' };
    }

    await supabase.from('payment_records').update({
        status: 'paid',
        period_start: result.period_start || parsed.data.startMonth,
        period_end: result.period_end || monthEnd(parsed.data.endMonth),
    }).eq('id', sourcePayment.id);

    await logAudit({
        action: 'ALLOCATE',
        entityType: 'wallet_payment_batches',
        entityId: result.batch_id,
        entityDisplay: `Future prepayment for resident ${parsed.data.residentId}`,
        newValues: {
            house_id: parsed.data.houseId,
            invoices_created: invoicesCreated,
            invoice_ids: invoiceIds,
            total_amount: totalAmount,
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
        invoicesCreated,
        invoicesPaid: Array.isArray(result.allocations) ? result.allocations.length : 0,
        totalAmount: Number(result.total_allocated || totalAmount),
        periodStart: result.period_start,
        periodEnd: result.period_end,
    };
}
