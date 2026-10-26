'use server'

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_PATTERN = /^[a-z][a-z0-9_]*$/;

type RetagResult = {
    success?: boolean;
    amount?: number;
    old_charge_category?: string;
    new_charge_category?: string;
    old_wallet_id?: string;
    old_wallet_balance?: number;
    new_wallet_id?: string;
    new_wallet_balance?: number;
};

type RetagRpcClient = {
    rpc: (name: 'retag_payment_charge_category', args: { p_payment_id: string; p_charge_category: string }) => Promise<{
        data: RetagResult | null;
        error: { message: string } | null;
    }>;
};

/**
 * Change what a payment is for (#1190). The payment's credit moves from the wallet of its old
 * charge category to the wallet of the new one in one transaction (retag_payment_charge_category),
 * which refuses a payment that has already paid invoices.
 */
export async function retagPaymentCategory(
    paymentId: string,
    chargeCategory: string,
): Promise<{ success: boolean; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

    if (typeof paymentId !== 'string' || !UUID_PATTERN.test(paymentId)) return { success: false, error: 'Invalid payment' };
    if (typeof chargeCategory !== 'string' || !CATEGORY_PATTERN.test(chargeCategory)) {
        return { success: false, error: 'Invalid charge category' };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as unknown as RetagRpcClient).rpc('retag_payment_charge_category', {
        p_payment_id: paymentId,
        p_charge_category: chargeCategory,
    });
    if (error || !data || data.success !== true) {
        return { success: false, error: error?.message || 'Changing the payment category failed' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'payments',
        entityId: paymentId,
        entityDisplay: `Payment ₦${Number(data.amount).toLocaleString()} moved from ${data.old_charge_category} to ${data.new_charge_category}`,
        oldValues: { charge_category: data.old_charge_category, wallet_id: data.old_wallet_id },
        newValues: {
            charge_category: data.new_charge_category,
            wallet_id: data.new_wallet_id,
            amount_moved: data.amount,
            old_wallet_balance: data.old_wallet_balance,
            new_wallet_balance: data.new_wallet_balance,
        },
    });

    revalidatePath('/payments');
    revalidatePath('/residents');
    return { success: true, error: null };
}
