'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface WalletTransaction {
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

export interface WalletWithBalance {
    id: string;
    resident_id: string;
    balance: number;
}

/**
 * Get or create a wallet for a resident
 */
export async function getOrCreateWallet(residentId: string): Promise<{ data: WalletWithBalance | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Try to get existing wallet
    let { data: wallet, error } = await supabase
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
        wallet = newWallet;
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
    const supabase = await createServerSupabaseClient();

    // Get or create wallet
    const { data: wallet, error: walletError } = await getOrCreateWallet(residentId);
    if (walletError || !wallet) {
        return { success: false, newBalance: 0, error: walletError || 'Failed to get wallet' };
    }

    const newBalance = wallet.balance + amount;

    // Update wallet balance
    const { error: updateError } = await supabase
        .from('resident_wallets')
        .update({ balance: newBalance })
        .eq('id', wallet.id);

    if (updateError) {
        return { success: false, newBalance: 0, error: updateError.message };
    }

    // Log transaction
    const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert({
            wallet_id: wallet.id,
            type: 'credit',
            amount,
            balance_after: newBalance,
            reference_type: referenceType,
            reference_id: referenceId,
            description: description || `Credit of ₦${amount.toLocaleString()}`,
        });

    if (txError) {
        console.error('[Wallet] Failed to log transaction:', txError);
    }

    revalidatePath('/residents');
    return { success: true, newBalance, error: null };
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
    const supabase = await createServerSupabaseClient();

    // Get or create wallet
    const { data: wallet, error: walletError } = await getOrCreateWallet(residentId);
    if (walletError || !wallet) {
        return { success: false, newBalance: 0, error: walletError || 'Failed to get wallet' };
    }

    // Check sufficient balance
    if (wallet.balance < amount) {
        return { success: false, newBalance: wallet.balance, error: 'Insufficient wallet balance' };
    }

    const newBalance = wallet.balance - amount;

    // Update wallet balance
    const { error: updateError } = await supabase
        .from('resident_wallets')
        .update({ balance: newBalance })
        .eq('id', wallet.id);

    if (updateError) {
        return { success: false, newBalance: 0, error: updateError.message };
    }

    // Log transaction
    const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount,
            balance_after: newBalance,
            reference_type: referenceType,
            reference_id: referenceId,
            description: description || `Debit of ₦${amount.toLocaleString()}`,
        });

    if (txError) {
        console.error('[Wallet] Failed to log transaction:', txError);
    }

    revalidatePath('/residents');
    return { success: true, newBalance, error: null };
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
 */
export async function allocateWalletToInvoices(
    residentId: string
): Promise<{ success: boolean; invoicesPaid: number; totalAllocated: number; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    let invoicesPaid = 0;
    let totalAllocated = 0;

    // Get unpaid invoices ordered by due_date (FIFO)
    const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, amount_due, amount_paid')
        .eq('resident_id', residentId)
        .in('status', ['unpaid', 'partially_paid'])
        .order('due_date', { ascending: true });

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
