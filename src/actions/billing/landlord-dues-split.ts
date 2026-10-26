'use server';

import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { coveredMonths, findHouseLandlords, type DuesContact } from '@/lib/billing/landlord-dues';
import { sendLandlordDuesReceipts, type TenantReceipt } from '@/lib/billing/landlord-dues-receipts';
import { lagosDateString } from '@/lib/whatsapp/assistant-format';
import { transferWalletCredit } from '@/actions/billing/wallet-transfers';

/**
 * "Split to tenants" (#1192, owner decision 7 of #1188): one landlord payment in the landlord's Dues
 * wallet pays the dues of the tenants of the landlord's "Dues paid by landlord" flats. Each flat's
 * share is a Transfer credit (#1191) to the tenant, settled against that tenant's Dues invoices in
 * that flat.
 */

export type LandlordDuesFlat = {
    houseId: string;
    houseLabel: string;
    tenantId: string;
    tenantName: string;
    owed: number;
};

export type LandlordDuesSplitPlan = {
    landlord: { id: string; name: string };
    walletId: string | null;
    walletBalance: number;
    flats: LandlordDuesFlat[];
};

type UnpaidInvoice = { house_id: string; resident_id: string; period_start: string | null; amount_due: number; amount_paid: number };

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function labelHouse(house: { house_number: string; short_name: string | null; street: unknown }): string {
    const street = (Array.isArray(house.street) ? house.street[0] : house.street) as { name: string } | null;
    return house.short_name || `${house.house_number}, ${street?.name || 'Estate'}`;
}

/** The plan plus what the split needs to write receipts: the landlord's contact and each tenant's invoices. */
async function loadSplit(supabase: Supabase, houseId: string): Promise<{
    plan: LandlordDuesSplitPlan | null;
    landlord?: DuesContact;
    tenants?: Map<string, DuesContact>;
    invoices?: UnpaidInvoice[];
    error: string | null;
}> {
    const { data: landlords, error: landlordError } = await findHouseLandlords(supabase, [houseId]);
    if (landlordError) return { plan: null, error: landlordError };
    const landlord = landlords.get(houseId);
    if (!landlord) return { plan: null, error: 'This house has no landlord on record' };

    // Every flagged house of this landlord, so one payment can pay all their flats.
    const { data: links, error: linksError } = await supabase
        .from('resident_houses')
        .select('house_id, house:houses!inner(id, house_number, short_name, dues_paid_by_landlord, street:streets(name))')
        .eq('resident_id', landlord.id)
        .eq('is_active', true)
        .eq('house.dues_paid_by_landlord', true);
    if (linksError) return { plan: null, error: linksError.message };
    const candidateIds = [...new Set((links || []).map((link) => link.house_id))];
    const { data: owners, error: ownersError } = await findHouseLandlords(supabase, candidateIds);
    if (ownersError) return { plan: null, error: ownersError };
    const houseIds = candidateIds.filter((id) => owners.get(id)?.id === landlord.id);
    if (!houseIds.includes(houseId)) return { plan: null, error: 'Dues paid by landlord is not on for this house' };

    const { data: wallet, error: walletError } = await supabase
        .from('resident_wallets')
        .select('id, balance')
        .eq('resident_id', landlord.id)
        .eq('charge_category', DEFAULT_CHARGE_CATEGORY)
        .maybeSingle();
    if (walletError) return { plan: null, error: walletError.message };

    const today = lagosDateString(new Date());
    const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('house_id, resident_id, period_start, amount_due, amount_paid, resident:residents!invoices_resident_id_fkey(id, first_name, last_name, email, phone_primary)')
        .in('house_id', houseIds)
        .eq('charge_category', DEFAULT_CHARGE_CATEGORY)
        .in('status', ['unpaid', 'partially_paid'])
        .neq('resident_id', landlord.id)
        .lte('period_start', today)
        .order('period_start', { ascending: true })
        .order('due_date', { ascending: true });
    if (invoicesError) return { plan: null, error: invoicesError.message };

    const tenants = new Map<string, DuesContact>();
    const flats = new Map<string, LandlordDuesFlat>();
    for (const invoice of invoices || []) {
        const tenant = (Array.isArray(invoice.resident) ? invoice.resident[0] : invoice.resident) as DuesContact | null;
        if (!tenant || !invoice.house_id) continue;
        tenants.set(tenant.id, tenant);
        const key = `${invoice.house_id}:${tenant.id}`;
        const link = (links || []).find((row) => row.house_id === invoice.house_id);
        const house = (Array.isArray(link?.house) ? link?.house[0] : link?.house) as Parameters<typeof labelHouse>[0] | undefined;
        const flat = flats.get(key) ?? {
            houseId: invoice.house_id,
            houseLabel: house ? labelHouse(house) : 'House',
            tenantId: tenant.id,
            tenantName: `${tenant.first_name} ${tenant.last_name}`.trim(),
            owed: 0,
        };
        flat.owed = Math.round((flat.owed + Number(invoice.amount_due) - Number(invoice.amount_paid)) * 100) / 100;
        flats.set(key, flat);
    }

    return {
        plan: {
            landlord: { id: landlord.id, name: `${landlord.first_name} ${landlord.last_name}`.trim() },
            walletId: wallet?.id ?? null,
            walletBalance: Number(wallet?.balance ?? 0),
            flats: [...flats.values()].filter((flat) => flat.owed > 0),
        },
        landlord,
        tenants,
        invoices: (invoices || []) as UnpaidInvoice[],
        error: null,
    };
}

/** The landlord's Dues wallet and each of their flagged flats with what its tenant owes in Dues. */
export async function getLandlordDuesSplit(
    houseId: string,
): Promise<{ data: LandlordDuesSplitPlan | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
    if (!z.string().uuid().safeParse(houseId).success) return { data: null, error: 'Invalid house' };

    const { plan, error } = await loadSplit(await createServerSupabaseClient(), houseId);
    return { data: plan, error };
}

const splitSchema = z.object({
    houseId: z.string().uuid(),
    allocations: z
        .array(z.object({
            houseId: z.string().uuid(),
            tenantId: z.string().uuid(),
            amount: z.number().positive().finite(),
        }))
        .min(1, 'Choose at least one flat'),
});

export type LandlordDuesSplitResult = {
    houseId: string;
    tenantId: string;
    amount: number;
    success: boolean;
    error: string | null;
    totalSettled: number;
};

/**
 * Split the landlord's Dues wallet to the tenants: one Transfer credit per flat (audited and settled
 * by transferWalletCredit), one audit row for the split, then the receipts.
 */
export async function splitLandlordDues(input: z.input<typeof splitSchema>): Promise<{
    results: LandlordDuesSplitResult[];
    receiptErrors: string[];
    error: string | null;
}> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    if (!auth.authorized) return { results: [], receiptErrors: [], error: auth.error || 'Unauthorized' };

    const parsed = splitSchema.safeParse(input);
    if (!parsed.success) return { results: [], receiptErrors: [], error: parsed.error.issues[0]?.message || 'Invalid split' };

    const supabase = await createServerSupabaseClient();
    const { plan, landlord, tenants, invoices, error } = await loadSplit(supabase, parsed.data.houseId);
    if (error || !plan || !landlord) return { results: [], receiptErrors: [], error: error || 'Split not available' };
    if (!plan.walletId) return { results: [], receiptErrors: [], error: 'The landlord has no Dues wallet' };

    const allocations = parsed.data.allocations.map((a) => ({ ...a, amount: Math.round(a.amount * 100) / 100 }));
    const total = allocations.reduce((sum, a) => sum + a.amount, 0);
    for (const allocation of allocations) {
        if (!plan.flats.some((f) => f.houseId === allocation.houseId && f.tenantId === allocation.tenantId)) {
            return { results: [], receiptErrors: [], error: 'Each tenant must owe dues in one of the landlord\'s flats' };
        }
    }
    if (total > plan.walletBalance) {
        return { results: [], receiptErrors: [], error: 'The split is more than the landlord\'s Dues wallet balance' };
    }

    const splitId = randomUUID();
    const results: LandlordDuesSplitResult[] = [];
    const receipts: TenantReceipt[] = [];
    for (const allocation of allocations) {
        const flat = plan.flats.find((f) => f.houseId === allocation.houseId && f.tenantId === allocation.tenantId)!;
        const transfer = await transferWalletCredit({
            fromWalletId: plan.walletId,
            toResidentId: allocation.tenantId,
            toChargeCategory: DEFAULT_CHARGE_CATEGORY,
            amount: allocation.amount,
            reason: `Dues paid by landlord for ${flat.houseLabel}`,
            houseId: allocation.houseId,
        });
        results.push({
            ...allocation,
            success: transfer.success,
            error: transfer.error || transfer.settlementError || null,
            totalSettled: transfer.totalSettled ?? 0,
        });
        const tenant = tenants?.get(allocation.tenantId);
        if (transfer.success && tenant) {
            const tenantInvoices = (invoices || []).filter(
                (i) => i.house_id === allocation.houseId && i.resident_id === allocation.tenantId,
            );
            receipts.push({
                tenant,
                flat: flat.houseLabel,
                amount: allocation.amount,
                months: coveredMonths(tenantInvoices, allocation.amount),
            });
        }
    }

    await logAudit({
        action: 'ALLOCATE',
        entityType: 'wallets',
        entityId: plan.walletId,
        entityDisplay: `Dues paid by landlord: split of ₦${total.toLocaleString()} from ${plan.landlord.name}`,
        newValues: {
            split_id: splitId,
            landlord_id: landlord.id,
            total,
            transfers: results,
        },
    });

    const receiptRun = await sendLandlordDuesReceipts({
        splitId,
        landlord,
        paymentDate: lagosDateString(new Date()),
        tenants: receipts,
    });

    return { results, receiptErrors: receiptRun.errors, error: null };
}
