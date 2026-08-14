'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentBatchReversal } from '@/lib/billing/wallet-payment-rpc';

const reverseBatchSchema = z.object({ batchId: z.string().uuid() });

export async function reverseWalletPaymentBatch(batchId: string) {
    const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_WALLETS);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

    const parsed = reverseBatchSchema.safeParse({ batchId });
    if (!parsed.success) return { success: false, error: 'Invalid wallet payment batch' };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await callWalletPaymentBatchReversal(supabase, {
        p_batch_id: parsed.data.batchId,
        p_reversed_by: auth.userId,
    });
    if (error) return { success: false, error: error.message };

    const result = data as { success?: boolean; batch_id?: string; new_wallet_balance?: number; total_reversed?: number } | null;
    if (!result?.success) return { success: false, error: 'Wallet payment batch could not be reversed' };

    await logAudit({
        action: 'UPDATE',
        entityType: 'wallet_payment_batches',
        entityId: parsed.data.batchId,
        entityDisplay: `Reversed wallet payment batch ${parsed.data.batchId}`,
        newValues: {
            status: 'reversed',
            total_reversed: result.total_reversed,
            new_wallet_balance: result.new_wallet_balance,
            reversed_by: auth.userId,
        },
    });

    revalidatePath('/billing');
    revalidatePath('/residents');
    return {
        success: true,
        batchId: result.batch_id || parsed.data.batchId,
        totalReversed: Number(result.total_reversed || 0),
        newWalletBalance: Number(result.new_wallet_balance || 0),
    };
}
