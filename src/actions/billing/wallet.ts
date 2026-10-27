'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';
import { debitWalletForInvoiceAtomic, type WalletInvoiceDebitResult } from '@/lib/billing/wallet-invoice-debit';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { invoiceLabel } from '@/lib/billing/invoice-label';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { eligibleSettlementInvoiceIds } from '@/lib/billing/eligible-invoices';

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
    charge_category: string;
    balance: number;
}

export type ResidentWalletLine = {
    charge_category: string;
    name: string;
    wallet_id: string | null;
    balance: number;
};

export type ResidentWallets = {
    total: number;
    wallets: ResidentWalletLine[];
};

type WalletAdjustmentResult = {
    success?: boolean;
    new_balance?: number;
    wallet_id?: string;
    charge_category?: string;
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
 * Get or create a resident's wallet of one charge category (Dues unless named, #1189)
 */
export async function getOrCreateWallet(
    residentId: string,
    chargeCategory: string = DEFAULT_CHARGE_CATEGORY,
): Promise<{ data: WalletWithBalance | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Try to get existing wallet
    const { data: wallet, error } = await supabase
        .from('resident_wallets')
        .select('id, resident_id, charge_category, balance')
        .eq('resident_id', residentId)
        .eq('charge_category', chargeCategory)
        .single();

    if (error && error.code === 'PGRST116') {
        // Not found, create new wallet
        const { data: newWallet, error: createError } = await supabase
            .from('resident_wallets')
            .insert({ resident_id: residentId, charge_category: chargeCategory, balance: 0 })
            .select('id, resident_id, charge_category, balance')
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
 * The total of a resident's wallets and one line per active charge category (#1189). A category
 * the resident has no wallet for shows ₦0. Read-only: creates no wallet.
 */
export async function getResidentWallets(residentId: string): Promise<{ data: ResidentWallets | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const [walletsResult, categoriesResult] = await Promise.all([
        supabase.from('resident_wallets').select('id, charge_category, balance').eq('resident_id', residentId),
        supabase.from('charge_categories').select('code, name, sort_order, is_active').order('sort_order', { ascending: true }),
    ]);
    if (walletsResult.error) return { data: null, error: walletsResult.error.message };
    if (categoriesResult.error) return { data: null, error: categoriesResult.error.message };

    const walletByCategory = new Map((walletsResult.data || []).map((wallet) => [wallet.charge_category, wallet]));
    const wallets = (categoriesResult.data || [])
        // An inactive category still shows while its wallet holds money.
        .filter((category) => category.is_active || Number(walletByCategory.get(category.code)?.balance || 0) !== 0)
        .map((category) => {
            const wallet = walletByCategory.get(category.code);
            return {
                charge_category: category.code,
                name: category.name,
                wallet_id: wallet?.id ?? null,
                balance: Number(wallet?.balance || 0),
            };
        });

    return {
        data: { total: (walletsResult.data || []).reduce((sum, wallet) => sum + Number(wallet.balance), 0), wallets },
        error: null,
    };
}

/**
 * Credit a resident's wallet (add funds) of one charge category (Dues unless named)
 */
export async function creditWallet(
    residentId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string,
    chargeCategory: string = DEFAULT_CHARGE_CATEGORY,
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
        p_charge_category: chargeCategory,
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
        newValues: { balance: data.new_balance, amount_credited: amount, reference_type: referenceType, charge_category: chargeCategory },
    });

    revalidatePath('/residents');
    return { success: true, newBalance: data.new_balance, error: null };
}

/**
 * Debit a resident's wallet (remove funds) of one charge category (Dues unless named) - for manual adjustments
 */
export async function debitWallet(
    residentId: string,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string,
    chargeCategory: string = DEFAULT_CHARGE_CATEGORY,
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
        p_charge_category: chargeCategory,
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
        newValues: { balance: data.new_balance, amount_debited: amount, reference_type: referenceType, charge_category: chargeCategory },
    });

    revalidatePath('/residents');
    return { success: true, newBalance: data.new_balance, error: null };
}

/**
 * Debit from wallet to pay an invoice (full or partial).
 *
 * Admin-callable server action: requires billing.manage_wallets and is audited.
 * Internal flows (levy generation, the payment allocator) use
 * debitWalletForInvoiceAtomic() directly and keep their own authorization.
 */
export async function debitWalletForInvoice(
    residentId: string,
    invoiceId: string
): Promise<{ success: boolean; amountDebited: number; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) {
        return { success: false, amountDebited: 0, error: auth.error || 'Unauthorized' };
    }

    if (typeof residentId !== 'string' || !UUID_PATTERN.test(residentId)) {
        return { success: false, amountDebited: 0, error: 'Invalid resident' };
    }
    if (typeof invoiceId !== 'string' || !UUID_PATTERN.test(invoiceId)) {
        return { success: false, amountDebited: 0, error: 'Invalid invoice' };
    }

    const supabase = await createServerSupabaseClient();
    const result = await debitWalletForInvoiceAtomic(supabase, residentId, invoiceId);
    if (!result.success) {
        return { success: false, amountDebited: 0, error: result.error || 'Wallet debit failed' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: result.walletId ?? residentId,
        entityDisplay: `Wallet debit for invoice ${result.invoiceNumber ?? invoiceId}`,
        oldValues: result.newBalance === null ? undefined : { balance: result.newBalance + result.amountDebited },
        newValues: {
            balance: result.newBalance,
            amount_debited: result.amountDebited,
            reference_type: 'invoice',
            reference_id: invoiceId,
        },
    });

    revalidatePath('/billing');
    revalidatePath('/residents');
    return { success: true, amountDebited: result.amountDebited, error: null };
}

/**
 * Allocate a wallet to unpaid invoices of its charge category (FIFO by due_date). A payment pays
 * the invoices of its own category, Dues when it names none (#1188 decision 2, #1190); a wallet
 * never pays another category (#1189). If houseId is provided, only that house's invoices are
 * paid and any leftover stays as credit: money is never moved to another house (decision 3).
 */
export async function allocateWalletToInvoices(
    residentId: string,
    houseId?: string | null,
    paymentDate?: string,
    options?: {
        sourcePaymentId?: string | null;
        batchAmount?: number | null;
        batchType?: 'payment_received' | 'existing_wallet_settlement' | 'future_prepayment';
        creditAmount?: number | null;
        chargeCategory?: string;
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
    const { chargeCategory = DEFAULT_CHARGE_CATEGORY, ...batch } = options ?? {};

    // Ordinary payment and approval flows use the same atomic primitive as
    // explicit admin settlement when batch metadata is supplied. This keeps
    // the new wallet credit and all eligible invoice allocations in one DB
    // transaction, while preserving the legacy allocator for callers that do
    // not yet create a payment batch (chargeCategory alone is not batch metadata).
    if (options && Object.keys(batch).length > 0) {
        const settlementDate = paymentDate || new Date().toISOString().slice(0, 10);
        const eligible = await eligibleSettlementInvoiceIds(supabase, { residentId, houseId, chargeCategory, settlementDate });
        if (eligible.error) return { success: false, invoicesPaid: 0, totalAllocated: 0, error: eligible.error };
        const invoiceIds = eligible.ids;

        if (invoiceIds.length === 0) {
            if (Number(options.creditAmount || 0) > 0) {
                const credit = await creditWallet(
                    residentId,
                    Number(options.creditAmount),
                    'payment',
                    options.sourcePaymentId || undefined,
                    'Payment retained as wallet credit because no eligible invoice was found',
                    chargeCategory,
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
            p_house_id: houseId || null,
            p_credit_amount: Number(options.creditAmount || 0),
            p_batch_amount: options.batchAmount == null ? null : Number(options.batchAmount),
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

    let invoicesPaid = 0;
    let totalAllocated = 0;

    // The debit result carries the post-debit balance, so the wallet is re-read only
    // when it does not (#778).
    const walletEmptyAfterDebit = async (result: WalletInvoiceDebitResult) => {
        if (result.newBalance !== null) return result.newBalance <= 0;
        if (result.error === 'Insufficient wallet balance') return true;
        const { data: wallet } = await getOrCreateWallet(residentId, chargeCategory);
        return !wallet || wallet.balance <= 0;
    };

    // Legacy callers (no payment batch): the wallet of the category, inside the house when one is given.
    let query = supabase
        .from('invoices')
        .select('id, amount_due, amount_paid, invoice_type, correction_type')
        .eq('resident_id', residentId)
        .eq('charge_category', chargeCategory)
        .in('status', ['unpaid', 'partially_paid'])
        .gte('amount_due', 0); // Exclude credit notes (negative amounts)
    if (houseId) query = query.eq('house_id', houseId);

    const { data: invoices, error: invoicesError } = await query.order('due_date', { ascending: true });

    if (invoicesError) {
        return { success: false, invoicesPaid: 0, totalAllocated: 0, error: invoicesError.message };
    }

    for (const invoice of invoices || []) {
        const result = await debitWalletForInvoiceAtomic(supabase, residentId, invoice.id);
        if (result.success && result.amountDebited > 0) {
            invoicesPaid++;
            totalAllocated += result.amountDebited;
        }

        if (await walletEmptyAfterDebit(result)) {
            break;
        }
    }

    return { success: true, invoicesPaid, totalAllocated, error: null };
}

/** Ids of every wallet of a resident, one per charge category (#1189). */
async function residentWalletIds(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
    residentId: string,
): Promise<{ ids: string[]; error: string | null }> {
    const { data, error } = await supabase.from('resident_wallets').select('id').eq('resident_id', residentId);
    return { ids: (data || []).map((wallet) => wallet.id), error: error?.message || null };
}

/**
 * Get wallet transactions for a resident, across all of the resident's wallets
 */
export async function getWalletTransactions(
    residentId: string,
    limit: number = 50
): Promise<{ data: WalletTransaction[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const wallets = await residentWalletIds(supabase, residentId);
    if (wallets.error) return { data: [], error: wallets.error };
    if (wallets.ids.length === 0) {
        return { data: [], error: null };
    }

    const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .in('wallet_id', wallets.ids)
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
    transactions: YearlyWalletTransaction[];
}

// Only the columns the yearly Transaction History view renders (#837).
const YEARLY_WALLET_TRANSACTION_COLUMNS =
    'id, wallet_id, type, amount, balance_after, reference_type, reference_id, description, created_at';

export type YearlyWalletTransaction = Omit<WalletTransaction, 'wallet_id'> & {
    // Which of the resident's wallets (one per charge category, #1189) the row belongs to.
    wallet_id?: string;
    // Set on credit rows that came from a payment (#1142).
    payment_method?: string | null;
    payment_reference?: string | null;
    // Set on debit rows settling an invoice, so the ledger can group them by billing item.
    invoice_item?: string | null;
    invoice_period_start?: string | null;
    invoice_number?: string | null;
};

/**
 * Get the resident wallet ledger, across all of the resident's wallets, grouped by calendar year for
 * the expandable Transaction History view on the resident detail page.
 */
export async function getYearlyWalletTransactions(
    residentId: string
): Promise<{ data: YearlyWalletTransactionSummary[]; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const wallets = await residentWalletIds(supabase, residentId);
    if (wallets.error) return { data: [], error: wallets.error };
    if (wallets.ids.length === 0) {
        return { data: [], error: null };
    }

    // Paged: a single read is capped at 1000 rows, which would silently truncate the ledger (#837).
    const { data, error } = await fetchAllRows<YearlyWalletTransaction>((from, to) =>
        supabase
            .from('wallet_transactions')
            .select(YEARLY_WALLET_TRANSACTION_COLUMNS)
            .in('wallet_id', wallets.ids)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)
    );

    if (error) {
        return { data: [], error };
    }

    // One batched read for the method and bank ref of every payment-linked row.
    const paymentIds = [...new Set((data || [])
        .filter((t) => t.reference_type === 'payment' && t.reference_id)
        .map((t) => t.reference_id as string))];
    const paymentById = new Map<string, { method: string | null; reference_number: string | null }>();
    for (let i = 0; i < paymentIds.length; i += 200) {
        const { data: payments, error: paymentsError } = await supabase
            .from('payment_records')
            .select('id, method, reference_number')
            .in('id', paymentIds.slice(i, i + 200));
        if (paymentsError) {
            return { data: [], error: paymentsError.message };
        }
        for (const payment of payments || []) paymentById.set(payment.id, payment);
    }

    const invoiceIds = [...new Set((data || [])
        .filter((t) => t.reference_type === 'invoice' && t.reference_id)
        .map((t) => t.reference_id as string))];
    const invoiceById = new Map<string, { invoice_number: string; invoice_type: string; period_start: string | null; rate_snapshot: unknown; billing_profile: { name: string } | { name: string }[] | null }>();
    for (let i = 0; i < invoiceIds.length; i += 200) {
        const { data: invoices, error: invoicesError } = await supabase
            .from('invoices')
            .select('id, invoice_number, invoice_type, period_start, rate_snapshot, billing_profile:billing_profiles(name)')
            .in('id', invoiceIds.slice(i, i + 200));
        if (invoicesError) {
            return { data: [], error: invoicesError.message };
        }
        for (const invoice of invoices || []) invoiceById.set(invoice.id, invoice);
    }

    const byYear = new Map<number, YearlyWalletTransactionSummary>();
    for (const transaction of data || []) {
        const invoice = transaction.reference_type === 'invoice' && transaction.reference_id
            ? invoiceById.get(transaction.reference_id)
            : undefined;
        if (invoice) {
            const profile = Array.isArray(invoice.billing_profile) ? invoice.billing_profile[0] : invoice.billing_profile;
            transaction.invoice_item = invoiceLabel({ invoice_type: invoice.invoice_type, rate_snapshot: invoice.rate_snapshot, profileName: profile?.name ?? null, periodStart: null });
            transaction.invoice_period_start = invoice.period_start;
            transaction.invoice_number = invoice.invoice_number;
        }
        const payment = transaction.reference_id ? paymentById.get(transaction.reference_id) : undefined;
        if (payment) {
            transaction.payment_method = payment.method;
            transaction.payment_reference = payment.reference_number;
        }
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

    // Year-end balance: the sum, over the resident's wallets, of each wallet's last balance_after
    // up to that year's end. Entries are descending, so walk them oldest first.
    const lastBalanceByWallet = new Map<string, number>();
    const ascending = [...(data || [])].reverse();
    let next = 0;
    for (const summary of [...byYear.values()].sort((a, b) => a.year - b.year)) {
        while (next < ascending.length && new Date(ascending[next].created_at).getFullYear() <= summary.year) {
            lastBalanceByWallet.set(ascending[next].wallet_id ?? '', Number(ascending[next].balance_after) || 0);
            next++;
        }
        summary.closing_balance = [...lastBalanceByWallet.values()].reduce((sum, value) => sum + value, 0);
    }

    return {
        data: [...byYear.values()].sort((a, b) => b.year - a.year),
        error: null,
    };
}
