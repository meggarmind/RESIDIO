'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';

export type WalletTransaction = {
    id: string;
    wallet_id: string;
    type: 'credit' | 'debit';
    amount: number;
    balance_after: number;
    reference_type: string | null;
    reference_id: string | null;
    description: string | null;
    created_at: string;
}

type WalletWithBalance = {
    id: string;
    resident_id: string;
    balance: number;
}

type WalletAdjustmentResult = {
    success?: boolean;
    new_balance?: number;
    wallet_id?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateWalletAdjustment(
    residentId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string,
): string | null {
    if (typeof residentId !== 'string' || !UUID_PATTERN.test(residentId)) return 'Invalid resident';
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 'Amount must be a finite number greater than zero';
    if (referenceType !== undefined && (typeof referenceType !== 'string' || referenceType.trim().length === 0)) return 'Invalid reference type';
    if (referenceId !== undefined && (typeof referenceId !== 'string' || !UUID_PATTERN.test(referenceId))) return 'Invalid reference ID';
    if (description !== undefined && (typeof description !== 'string' || description.trim().length === 0)) return 'Invalid description';
    if (referenceType?.trim() === 'adjustment' && !description?.trim()) return 'Adjustment description is required';
    return null;
}

type WalletAdjustmentRpcClient = {
    rpc: (name: 'adjust_wallet_credit' | 'adjust_wallet_debit', args: Record<string, unknown>) => Promise<{
        data: WalletAdjustmentResult | null;
        error: { message: string } | null;
    }>;
};

/**
 * Get or create a wallet for a resident
 */
export async function getOrCreateWallet(residentId: string): Promise<{ data: WalletWithBalance | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Try to get existing wallet
    const { data: wallet, error } = await supabase
        .from('resident_wallets')
        .select('id, resident_id, balance')
        .eq('resident_id', residentId)
        .single();

    if (error && error.code === 'PGRST116') {
        // Not found, create new wallet
        const { data: newWallet, error: createError } = await supabase
            .from('resident_wallets')
            .insert({ resident_id: residentId, balance: 0 })
            .select('id, resident_id, balance')
            .single();

        if (createError) {
            return { data: null, error: createError.message };
        }
        return { data: newWallet, error: null };
    } else if (error) {
        return { data: null, error: error.message };
    }

    return { data: wallet, error: null };
}

/**
 * Credit a resident's wallet (add funds)
 */
export async function creditWallet(
    residentId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string
): Promise<{ success: boolean; newBalance: number; error: string | null }> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) {
        return { success: false, newBalance: 0, error: auth.error || 'Unauthorized' };
    }

    const validationError = validateWalletAdjustment(residentId, amount, referenceType, referenceId, description);
    if (validationError) return { success: false, newBalance: 0, error: validationError };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as unknown as WalletAdjustmentRpcClient).rpc('adjust_wallet_credit', {
        p_resident_id: residentId,
        p_amount: amount,
        p_reference_type: referenceType?.trim() || null,
        p_reference_id: referenceId || null,
        p_description: description?.trim() || `Credit of ₦${amount.toLocaleString()}`,
    });

    if (error || !data || data.success !== true || typeof data.new_balance !== 'number' || !data.wallet_id) {
        return { success: false, newBalance: 0, error: error?.message || 'Wallet credit failed' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: data.wallet_id,
        entityDisplay: `Wallet credit for resident ${residentId}`,
        oldValues: { balance: data.new_balance - amount },
        newValues: { balance: data.new_balance, amount_credited: amount, reference_type: referenceType },
    });

    revalidatePath('/residents');
    return { success: true, newBalance: data.new_balance, error: null };
}

/**
 * Debit a resident's wallet (remove funds) - for manual adjustments
 */
export async function debitWallet(
    residentId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string
): Promise<{ success: boolean; newBalance: number; error: string | null }> {
    // Permission check
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) {
        return { success: false, newBalance: 0, error: auth.error || 'Unauthorized' };
    }

    const validationError = validateWalletAdjustment(residentId, amount, referenceType, referenceId, description);
    if (validationError) return { success: false, newBalance: 0, error: validationError };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as unknown as WalletAdjustmentRpcClient).rpc('adjust_wallet_debit', {
        p_resident_id: residentId,
        p_amount: amount,
        p_reference_type: referenceType?.trim() || null,
        p_reference_id: referenceId || null,
        p_description: description?.trim() || `Debit of ₦${amount.toLocaleString()}`,
    });

    if (error || !data || data.success !== true || typeof data.new_balance !== 'number' || !data.wallet_id) {
        return { success: false, newBalance: 0, error: error?.message || 'Wallet debit failed' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: data.wallet_id,
        entityDisplay: `Wallet debit for resident ${residentId}`,
        oldValues: { balance: data.new_balance + amount },
        newValues: { balance: data.new_balance, amount_debited: amount, reference_type: referenceType },
    });

    revalidatePath('/residents');
    return { success: true, newBalance: data.new_balance, error: null };
}

/**
 * Debit from wallet to pay an invoice (full or partial)
 */
export async function debitWalletForInvoice(
    residentId: string,
    invoiceId: string
): Promise<{ success: boolean; amountDebited: number; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Get wallet
    const { data: wallet, error: walletError } = await getOrCreateWallet(residentId);
    if (walletError || !wallet) {
        return { success: false, amountDebited: 0, error: walletError || 'Failed to get wallet' };
    }

    if (wallet.balance <= 0) {
        return { success: false, amountDebited: 0, error: 'Insufficient wallet balance' };
    }

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, amount_due, amount_paid, status, invoice_number')
        .eq('id', invoiceId)
        .single();

    if (invoiceError || !invoice) {
        return { success: false, amountDebited: 0, error: 'Invoice not found' };
    }

    const remainingDue = invoice.amount_due - invoice.amount_paid;
    if (remainingDue <= 0) {
        return { success: false, amountDebited: 0, error: 'Invoice already paid' };
    }

    // Calculate how much we can pay
    const amountToDebit = Math.min(wallet.balance, remainingDue);
    const newWalletBalance = wallet.balance - amountToDebit;
    const newAmountPaid = invoice.amount_paid + amountToDebit;
    const newStatus = newAmountPaid >= invoice.amount_due ? 'paid' : 'partially_paid';

    // Update wallet
    const { error: walletUpdateError } = await supabase
        .from('resident_wallets')
        .update({ balance: newWalletBalance })
        .eq('id', wallet.id);

    if (walletUpdateError) {
        return { success: false, amountDebited: 0, error: walletUpdateError.message };
    }

    // Update invoice
    const { error: invoiceUpdateError } = await supabase
        .from('invoices')
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq('id', invoiceId);

    if (invoiceUpdateError) {
        // Rollback wallet
        await supabase
            .from('resident_wallets')
            .update({ balance: wallet.balance })
            .eq('id', wallet.id);
        return { success: false, amountDebited: 0, error: invoiceUpdateError.message };
    }

    // Log transaction
    await supabase
        .from('wallet_transactions')
        .insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount: amountToDebit,
            balance_after: newWalletBalance,
            reference_type: 'invoice',
            reference_id: invoiceId,
            description: `Payment for ${invoice.invoice_number}`,
        });

    revalidatePath('/billing');
    revalidatePath('/residents');
    return { success: true, amountDebited: amountToDebit, error: null };
}

/**
 * Allocate wallet balance to all unpaid invoices (FIFO by due_date)
 * If priorityHouseId is provided, prioritize invoices for that house first
 */
export async function allocateWalletToInvoices(
    residentId: string,
    priorityHouseId?: string | null,
    paymentDate?: string,
    options?: {
        sourcePaymentId?: string | null;
        batchAmount?: number | null;
        batchType?: 'payment_received' | 'existing_wallet_settlement' | 'future_prepayment';
        creditAmount?: number | null;
    },
): Promise<{
    success: boolean;
    invoicesPaid: number;
    totalAllocated: number;
    error: string | null;
    batchId?: string;
    receiptNumber?: string;
}> {
    const supabase = await createServerSupabaseClient();

    // Ordinary payment and approval flows use the same atomic primitive as
    // explicit admin settlement when batch metadata is supplied. This keeps
    // the new wallet credit and all eligible invoice allocations in one DB
    // transaction, while preserving the legacy allocator for callers that do
    // not yet create a payment batch.
    if (options) {
        const settlementDate = paymentDate || new Date().toISOString().slice(0, 10);
        const fetchEligible = async (houseId?: string | null) => {
            let query = supabase
                .from('invoices')
                .select('id, period_start, due_date')
                .eq('resident_id', residentId)
                .in('status', ['unpaid', 'partially_paid'])
                .gte('amount_due', 0)
                .lte('period_start', settlementDate);
            if (houseId) query = query.eq('house_id', houseId);
            const result = await query.order('period_start', { ascending: true }).order('due_date', { ascending: true });
            return result;
        };

        const invoiceIds: string[] = [];
        if (priorityHouseId) {
            const priority = await fetchEligible(priorityHouseId);
            if (priority.error) return { success: false, invoicesPaid: 0, totalAllocated: 0, error: priority.error.message };
            invoiceIds.push(...(priority.data || []).map((invoice) => invoice.id));
        }
        const general = await fetchEligible();
        if (general.error) return { success: false, invoicesPaid: 0, totalAllocated: 0, error: general.error.message };
        for (const invoice of general.data || []) {
            if (!invoiceIds.includes(invoice.id)) invoiceIds.push(invoice.id);
        }

        if (invoiceIds.length === 0) {
            if (Number(options.creditAmount || 0) > 0) {
                const credit = await creditWallet(
                    residentId,
                    Number(options.creditAmount),
                    'payment',
                    options.sourcePaymentId || undefined,
                    'Payment retained as wallet credit because no eligible invoice was found',
                );
                return { success: credit.success, invoicesPaid: 0, totalAllocated: 0, error: credit.error };
            }
            return { success: true, invoicesPaid: 0, totalAllocated: 0, error: null };
        }

        const rpcResult = await callWalletPaymentRpc(supabase, {
            p_resident_id: residentId,
            p_invoice_ids: invoiceIds,
            p_batch_type: options.batchType || 'payment_received',
            p_payment_date: settlementDate,
            p_source_payment_id: options.sourcePaymentId || null,
            p_house_id: priorityHouseId || null,
            p_credit_amount: Number(options.creditAmount || 0),
            p_batch_amount: options.batchAmount == null ? null : Number(options.batchAmount),
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

    let invoicesPaid = 0;
    let totalAllocated = 0;

    // If priority house provided, get those invoices first
    if (priorityHouseId) {
        const { data: priorityInvoices, error: priorityError } = await supabase
            .from('invoices')
            .select('id, amount_due, amount_paid, invoice_number, invoice_type, correction_type')
            .eq('resident_id', residentId)
            .eq('house_id', priorityHouseId)
            .in('status', ['unpaid', 'partially_paid'])
            .gte('amount_due', 0) // Exclude credit notes (negative amounts)
            .order('due_date', { ascending: true });

        if (!priorityError && priorityInvoices && priorityInvoices.length > 0) {
            for (const invoice of priorityInvoices) {
                const result = await debitWalletForInvoice(residentId, invoice.id);
                if (result.success && result.amountDebited > 0) {
                    invoicesPaid++;
                    totalAllocated += result.amountDebited;
                    console.log(`[Wallet] Allocated ₦${result.amountDebited} to priority house invoice ${invoice.invoice_number}`);
                }

                // Check if wallet is now empty
                const { data: wallet } = await getOrCreateWallet(residentId);
                if (!wallet || wallet.balance <= 0) {
                    return { success: true, invoicesPaid, totalAllocated, error: null };
                }
            }
        }
    }

    // Get all remaining unpaid invoices (excluding priority house if provided)
    let query = supabase
        .from('invoices')
        .select('id, amount_due, amount_paid, invoice_type, correction_type')
        .eq('resident_id', residentId)
        .in('status', ['unpaid', 'partially_paid'])
        .gte('amount_due', 0); // Exclude credit notes (negative amounts)

    // Exclude priority house invoices (already processed)
    if (priorityHouseId) {
        query = query.neq('house_id', priorityHouseId);
    }

    const { data: invoices, error: invoicesError } = await query.order('due_date', { ascending: true });

    if (invoicesError) {
        return { success: false, invoicesPaid: 0, totalAllocated: 0, error: invoicesError.message };
    }

    for (const invoice of invoices || []) {
        const result = await debitWalletForInvoice(residentId, invoice.id);
        if (result.success && result.amountDebited > 0) {
            invoicesPaid++;
            totalAllocated += result.amountDebited;
        }

        // Check if wallet is now empty
        const { data: wallet } = await getOrCreateWallet(residentId);
        if (!wallet || wallet.balance <= 0) {
            break;
        }
    }

    return { success: true, invoicesPaid, totalAllocated, error: null };
}

/**
 * Get wallet transactions for a resident
 */
export async function getWalletTransactions(
    residentId: string,
    limit: number = 50
): Promise<{ data: WalletTransaction[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: wallet } = await getOrCreateWallet(residentId);
    if (!wallet) {
        return { data: [], error: null };
    }

    const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        return { data: [], error: error.message };
    }

  return { data: data || [], error: null };
}

export interface YearlyWalletTransactionSummary {
    year: number;
    total_credits: number;
    total_debits: number;
    net_change: number;
    closing_balance: number;
    transactions: WalletTransaction[];
}

/**
 * Get the resident wallet ledger grouped by calendar year for the expandable
 * Transaction History view on the resident detail page.
 */
export async function getYearlyWalletTransactions(
    residentId: string
): Promise<{ data: YearlyWalletTransactionSummary[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: wallet } = await getOrCreateWallet(residentId);
    if (!wallet) {
        return { data: [], error: null };
    }

    const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false });

    if (error) {
        return { data: [], error: error.message };
    }

    const byYear = new Map<number, YearlyWalletTransactionSummary>();
    for (const transaction of data || []) {
        const year = new Date(transaction.created_at).getFullYear();
        if (!byYear.has(year)) {
            byYear.set(year, {
                year,
                total_credits: 0,
                total_debits: 0,
                net_change: 0,
                closing_balance: 0,
                transactions: [],
            });
        }

        const summary = byYear.get(year)!;
        const amount = Number(transaction.amount) || 0;
        if (transaction.type === 'credit') {
            summary.total_credits += amount;
            summary.net_change += amount;
        } else {
            summary.total_debits += amount;
            summary.net_change -= amount;
        }
        summary.transactions.push(transaction);
    }

    for (const summary of byYear.values()) {
        // Entries are descending, so the first entry holds the year-end balance.
        summary.closing_balance = Number(summary.transactions[0]?.balance_after) || 0;
    }

    return {
        data: [...byYear.values()].sort((a, b) => b.year - a.year),
        error: null,
    };
}
