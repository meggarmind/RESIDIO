'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { callWalletPaymentRpc } from '@/lib/billing/wallet-payment-rpc';
import { houseLabel } from '@/lib/whatsapp/financial';

/**
 * Admin "Transfer credit" (#1191, owner decision 6 of #1188): move credit between the wallets of one
 * person, or to a different person linked to the same house. The RPCs enforce the rules; these
 * actions add the permission check, the audit row and the settlement of the receiving wallet.
 */

export type WalletTransferTarget = {
    houseId: string;
    houseLabel: string;
    residents: Array<{ id: string; name: string }>;
};

type RpcClient = {
    rpc: (name: 'transfer_wallet_credit' | 'reverse_wallet_transfer', args: Record<string, unknown>) => Promise<{
        data: Record<string, unknown> | null;
        error: { message: string } | null;
    }>;
};

const transferSchema = z.object({
    fromWalletId: z.string().uuid(),
    toResidentId: z.string().uuid(),
    toChargeCategory: z.string().regex(/^[a-z][a-z0-9_]*$/),
    amount: z.number().positive(),
    reason: z.string().trim().min(1, 'A reason is required'),
    // The house whose invoices the receiving wallet settles; no house means no settlement.
    houseId: z.string().uuid().nullable().optional(),
});

const reverseSchema = z.object({
    transferId: z.string().uuid(),
    reason: z.string().trim().min(1, 'A reason is required'),
});

/**
 * The houses the resident is actively linked to, each with the residents actively linked to it
 * (the resident included): the people credit can be transferred to.
 */
export async function getWalletTransferTargets(
    residentId: string,
): Promise<{ data: WalletTransferTarget[] | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
    if (!z.string().uuid().safeParse(residentId).success) return { data: null, error: 'Invalid resident' };

    const supabase = await createServerSupabaseClient();
    const { data: links, error } = await supabase
        .from('resident_houses')
        .select('house_id, house:houses(house_number, short_name, street:streets(name))')
        .eq('resident_id', residentId)
        .eq('is_active', true);
    if (error) return { data: null, error: error.message };
    const houseIds = [...new Set((links || []).map((link) => link.house_id))];
    if (houseIds.length === 0) return { data: [], error: null };

    const { data: members, error: membersError } = await supabase
        .from('resident_houses')
        .select('house_id, resident:residents!resident_houses_resident_id_fkey(id, first_name, last_name)')
        .in('house_id', houseIds)
        .eq('is_active', true);
    if (membersError) return { data: null, error: membersError.message };

    const targets = houseIds.map((houseId) => {
        const link = (links || []).find((row) => row.house_id === houseId);
        const residents = new Map<string, string>();
        for (const member of members || []) {
            const resident = Array.isArray(member.resident) ? member.resident[0] : member.resident;
            if (member.house_id === houseId && resident) {
                residents.set(resident.id, `${resident.first_name} ${resident.last_name}`.trim());
            }
        }
        return {
            houseId,
            houseLabel: link?.house ? houseLabel(link.house) : 'House',
            residents: [...residents].map(([id, name]) => ({ id, name })),
        };
    });
    return { data: targets, error: null };
}

/**
 * Transfer credit from one wallet to a wallet of the same person or of a person linked to the same
 * house, then settle the receiving wallet against its owner's unpaid invoices of that category in
 * the chosen house (#1191 item 4).
 */
export async function transferWalletCredit(input: z.input<typeof transferSchema>): Promise<{
    success: boolean;
    error: string | null;
    transferId?: string;
    totalSettled?: number;
    settlementError?: string | null;
}> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid transfer request' };
    const { fromWalletId, toResidentId, toChargeCategory, amount, reason, houseId } = parsed.data;

    const supabase = await createServerSupabaseClient();
    if (houseId) {
        const { data: link, error } = await supabase
            .from('resident_houses')
            .select('id')
            .eq('resident_id', toResidentId)
            .eq('house_id', houseId)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (error) return { success: false, error: error.message };
        if (!link) return { success: false, error: 'The receiving resident is not linked to that house' };
    }

    const { data, error } = await (supabase as unknown as RpcClient).rpc('transfer_wallet_credit', {
        p_from_wallet: fromWalletId,
        p_to_resident: toResidentId,
        p_to_category: toChargeCategory,
        p_amount: amount,
        p_reason: reason,
    });
    if (error || !data || data.success !== true || typeof data.transfer_id !== 'string') {
        return { success: false, error: error?.message || 'Wallet transfer failed' };
    }
    const transferId = data.transfer_id;

    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: fromWalletId,
        entityDisplay: `Wallet credit transfer of ₦${amount.toLocaleString()}`,
        oldValues: {
            from_balance: Number(data.from_balance) + amount,
            to_balance: Number(data.to_balance) - amount,
        },
        newValues: {
            transfer_id: transferId,
            amount,
            reason,
            from_wallet_id: fromWalletId,
            from_resident_id: data.from_resident_id,
            from_charge_category: data.from_charge_category,
            from_balance: data.from_balance,
            to_wallet_id: data.to_wallet_id,
            to_resident_id: toResidentId,
            to_charge_category: toChargeCategory,
            to_balance: data.to_balance,
            house_id: houseId ?? null,
        },
    });

    let totalSettled = 0;
    let settlementError: string | null = null;
    if (houseId) {
        const settlement = await settleReceivingWallet(supabase, toResidentId, toChargeCategory, houseId, auth.userId);
        totalSettled = settlement.totalSettled;
        settlementError = settlement.error;
    }

    revalidatePath('/billing');
    revalidatePath('/residents');
    revalidatePath(`/residents/${toResidentId}`);
    if (data.from_resident_id !== toResidentId) revalidatePath(`/residents/${data.from_resident_id}`);
    return { success: true, error: null, transferId, totalSettled, settlementError };
}

/** Settles the receiving wallet against its owner's unpaid invoices of one category in one house, oldest first. */
async function settleReceivingWallet(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
    residentId: string,
    chargeCategory: string,
    houseId: string,
    actorId: string | null | undefined,
): Promise<{ totalSettled: number; error: string | null }> {
    const settlementDate = new Date().toISOString().slice(0, 10);
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('id')
        .eq('resident_id', residentId)
        .eq('house_id', houseId)
        .eq('charge_category', chargeCategory)
        .in('status', ['unpaid', 'partially_paid'])
        .gte('amount_due', 0)
        .lte('period_start', settlementDate)
        .order('period_start', { ascending: true })
        .order('due_date', { ascending: true });
    if (error) return { totalSettled: 0, error: error.message };
    if (!invoices || invoices.length === 0) return { totalSettled: 0, error: null };

    const invoiceIds = invoices.map((invoice) => invoice.id);
    const result = await callWalletPaymentRpc(supabase, {
        p_resident_id: residentId,
        p_invoice_ids: invoiceIds,
        p_batch_type: 'existing_wallet_settlement',
        p_payment_date: settlementDate,
        p_source_payment_id: null,
        p_house_id: houseId,
        p_credit_amount: 0,
        p_batch_amount: null,
        p_created_by: actorId ?? null,
        p_charge_category: chargeCategory,
    });
    if (result.error) return { totalSettled: 0, error: result.error.message };

    const batch = result.data as { success?: boolean; batch_id?: string; receipt_number?: string; total_allocated?: number } | null;
    if (!batch?.success || !batch.batch_id) return { totalSettled: 0, error: null };
    await logAudit({
        action: 'ALLOCATE',
        entityType: 'wallet_payment_batches',
        entityId: batch.batch_id,
        entityDisplay: `Wallet settlement after credit transfer for resident ${residentId}`,
        newValues: {
            invoice_ids: invoiceIds,
            total_allocated: batch.total_allocated,
            charge_category: chargeCategory,
            house_id: houseId,
            receipt_number: batch.receipt_number,
        },
    });
    return { totalSettled: Number(batch.total_allocated || 0), error: null };
}

/** Reverse a transfer: the receiving wallet must still hold the amount. */
export async function reverseWalletTransfer(input: z.input<typeof reverseSchema>): Promise<{ success: boolean; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

    const parsed = reverseSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid reversal request' };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as unknown as RpcClient).rpc('reverse_wallet_transfer', {
        p_transfer_id: parsed.data.transferId,
        p_reason: parsed.data.reason,
    });
    if (error || !data || data.success !== true) {
        return { success: false, error: error?.message || 'Wallet transfer reversal failed' };
    }

    const amount = Number(data.amount);
    await logAudit({
        action: 'UPDATE',
        entityType: 'wallets',
        entityId: String(data.from_wallet_id),
        entityDisplay: `Reversal of wallet credit transfer of ₦${amount.toLocaleString()}`,
        oldValues: { from_balance: Number(data.from_balance) - amount, to_balance: Number(data.to_balance) + amount },
        newValues: {
            transfer_id: parsed.data.transferId,
            reversed: true,
            amount,
            reason: parsed.data.reason,
            transfer_description: data.transfer_description,
            from_wallet_id: data.from_wallet_id,
            from_resident_id: data.from_resident_id,
            from_balance: data.from_balance,
            to_wallet_id: data.to_wallet_id,
            to_resident_id: data.to_resident_id,
            to_balance: data.to_balance,
        },
    });

    revalidatePath('/billing');
    revalidatePath('/residents');
    revalidatePath(`/residents/${data.from_resident_id}`);
    if (data.to_resident_id !== data.from_resident_id) revalidatePath(`/residents/${data.to_resident_id}`);
    return { success: true, error: null };
}
