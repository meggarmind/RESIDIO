'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { callWalletInvoiceRpc } from '@/lib/billing/wallet-payment-rpc';

type BulkRpcData = {
    success?: boolean;
    error?: string;
    total_paid?: number;
    count_paid?: number;
    new_wallet_balance?: number;
    old_wallet_balance?: number;
};

/**
 * Pay multiple invoices (in full) using the resident's wallet balance.
 *
 * All-or-nothing: the `pay_invoices_with_wallet` RPC validates every invoice and the total
 * against the wallet under row locks, then debits the wallet, updates every invoice and
 * writes one ledger row per invoice (with a correct running balance_after) in ONE database
 * transaction. Ownership is re-checked inside the database. No client-side read-modify-write.
 */
export async function payMultipleInvoicesWithWallet(
    invoiceIds: string[]
): Promise<{
    success: boolean;
    totalPaid: number;
    newWalletBalance: number;
    countPaid: number;
    error: string | null;
}> {
    const fail = (error: string, newWalletBalance = 0) => ({
        success: false,
        totalPaid: 0,
        newWalletBalance,
        countPaid: 0,
        error,
    });

    if (!invoiceIds || invoiceIds.length === 0) {
        return fail('No invoices selected');
    }

    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return fail('Not authenticated');
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('resident_id')
        .eq('id', user.id)
        .single();

    if (profileError || !profile?.resident_id) {
        return fail('No resident profile found');
    }

    const { data, error } = await callWalletInvoiceRpc(supabase, 'pay_invoices_with_wallet', {
        p_items: invoiceIds.map((id) => ({ invoice_id: id })),
    });
    const result = data as BulkRpcData | null;

    if (error || !result) {
        return fail(error?.message || 'Bulk payment failed');
    }
    if (!result.success) {
        return fail(result.error || 'Bulk payment failed', result.new_wallet_balance ?? 0);
    }

    const totalPaid = Number(result.total_paid);
    const countPaid = Number(result.count_paid);
    const newWalletBalance = Number(result.new_wallet_balance);

    await logAudit({
        action: 'UPDATE',
        entityType: 'invoices',
        entityId: user.id, // Grouping by user
        entityDisplay: `Bulk wallet payment for ${invoiceIds.length} invoices`,
        oldValues: { count: invoiceIds.length, total: totalPaid, wallet_balance: result.old_wallet_balance },
        newValues: { countPaid, wallet_balance: newWalletBalance },
    });

    revalidatePath('/portal/invoices');
    revalidatePath('/portal/wallet');
    revalidatePath('/portal');

    return {
        success: true,
        totalPaid,
        newWalletBalance,
        countPaid,
        error: null,
    };
}
