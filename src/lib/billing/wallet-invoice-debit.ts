import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';

/**
 * Minimal structural type for the Supabase client used here. Typed loosely so
 * the helper can be unit-tested without a network client.
 */
type Filter = {
    eq: (column: string, value: string) => Filter;
    maybeSingle: () => PromiseLike<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
    }>;
};
type QueryClient = {
    from: (table: string) => {
        select: (columns: string) => Filter;
    };
};

export type WalletInvoiceDebitResult = {
    success: boolean;
    amountDebited: number;
    walletId: string | null;
    newBalance: number | null;
    invoiceNumber: string | null;
    error: string | null;
};

const fail = (error: string): WalletInvoiceDebitResult => ({
    success: false,
    amountDebited: 0,
    walletId: null,
    newBalance: null,
    invoiceNumber: null,
    error,
});

/**
 * Pay (fully or partially) one invoice from the resident's wallet of the invoice's charge
 * category (#1189), atomically.
 *
 * NOT an authorization boundary: this is a plain library function with no
 * permission check. Callers decide who may reach it. The exported server action
 * `debitWalletForInvoice` wraps it with authorizePermission() + logAudit();
 * levy generation and the payment allocator call it directly because they are
 * already inside their own authorized (or recipient/webhook) flows.
 *
 * The wallet debit, invoice update and ledger insert all happen inside the
 * `settle_wallet_invoices` RPC (one DB transaction, wallet row locked), replacing
 * the previous client-side read-modify-write with a best-effort rollback.
 */
export async function debitWalletForInvoiceAtomic(
    supabase: unknown,
    residentId: string,
    invoiceId: string,
): Promise<WalletInvoiceDebitResult> {
    const db = supabase as QueryClient;

    const { data: invoice, error: invoiceError } = await db
        .from('invoices')
        .select('id, amount_due, amount_paid, invoice_number, house_id, charge_category')
        .eq('id', invoiceId)
        .maybeSingle();
    if (invoiceError || !invoice) return fail('Invoice not found');
    const chargeCategory = (invoice.charge_category as string | null) ?? DEFAULT_CHARGE_CATEGORY;

    const { data: wallet, error: walletError } = await db
        .from('resident_wallets')
        .select('id, balance')
        .eq('resident_id', residentId)
        .eq('charge_category', chargeCategory)
        .maybeSingle();
    if (walletError) return fail(walletError.message);

    const balance = Number(wallet?.balance ?? 0);
    if (!wallet || balance <= 0) return fail('Insufficient wallet balance');

    const remainingDue = Number(invoice.amount_due) - Number(invoice.amount_paid);
    if (remainingDue <= 0) return fail('Invoice already paid');

    const rpc = await callWalletPaymentRpc(supabase, {
        p_resident_id: residentId,
        p_invoice_ids: [invoiceId],
        p_batch_type: 'existing_wallet_settlement',
        p_payment_date: new Date().toISOString().slice(0, 10),
        p_house_id: (invoice.house_id as string | null) ?? null,
        p_charge_category: chargeCategory,
    });
    if (rpc.error) return fail(rpc.error.message);

    const data = (rpc.data || {}) as { success?: boolean; total_allocated?: number; new_wallet_balance?: number };
    if (data.success !== true) return fail('Wallet debit failed');

    return {
        success: true,
        amountDebited: Number(data.total_allocated || 0),
        walletId: wallet.id as string,
        newBalance: typeof data.new_wallet_balance === 'number' ? data.new_wallet_balance : null,
        invoiceNumber: (invoice.invoice_number as string | null) ?? null,
        error: null,
    };
}
