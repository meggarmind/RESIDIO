'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { formatCurrency } from '@/lib/utils';
import { WRITE_OFF_REASONS, WRITE_OFF_REASON_LABELS } from '@/types/database';

/**
 * Dues write-off (#1460, owner option B): an admin writes off the unpaid balance of a resident's
 * open bills, with a reason and a note, and can undo it. The RPCs (migration
 * 20261107140000_invoice_write_offs.sql) do the work in one transaction and check the permission
 * again; these actions add the permission check, the input checks and the audit row.
 */

export type WriteOffCandidate = {
    id: string;
    invoice_number: string;
    house_id: string | null;
    house_label: string;
    charge_category: string;
    period_start: string | null;
    amount_due: number;
    amount_paid: number;
    status: 'unpaid' | 'partially_paid';
};

type RpcResult = {
    success?: boolean;
    error?: string;
    batch_id?: string;
    count?: number;
    total?: number | string;
    resident_id?: string;
    invoice_ids?: string[];
};

type RpcClient = {
    rpc: (name: 'write_off_invoices' | 'undo_invoice_write_off', args: Record<string, unknown>) => Promise<{
        data: RpcResult | null;
        error: { message: string } | null;
    }>;
};

const writeOffSchema = z.object({
    residentId: z.string().uuid(),
    invoiceIds: z.array(z.string().uuid()).min(1, 'Select at least one bill').max(1000, 'Select at most 1000 bills at a time'),
    reason: z.enum(WRITE_OFF_REASONS),
    note: z.string().trim().min(5, 'A note of at least 5 characters is required'),
});

// Not imported from lib/whatsapp/financial: that module drags the report PDFs into client bundles that import this file.
function labelHouse(embed: unknown): string {
    const house = (Array.isArray(embed) ? embed[0] : embed) as
        | { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null }
        | null
        | undefined;
    if (!house) return 'No house';
    const street = Array.isArray(house.street) ? house.street[0]?.name : house.street?.name;
    return house.short_name || `${house.house_number}, ${street || 'Estate'}`;
}

function revalidateResident(residentId: string | undefined) {
    revalidatePath('/billing');
    revalidatePath('/residents');
    if (residentId) revalidatePath(`/residents/${residentId}`);
}

async function residentName(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, residentId: string): Promise<string> {
    const { data } = await supabase.from('residents').select('first_name, last_name').eq('id', residentId).maybeSingle();
    return data ? `${data.first_name} ${data.last_name}`.trim() : 'resident';
}

/** The resident's open bills (unpaid or part-paid, with a balance left), oldest first. Feeds the write-off form, so it takes the write-off permission. */
export async function getWriteOffCandidates(residentId: string): Promise<{ data: WriteOffCandidate[] | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
    if (!z.string().uuid().safeParse(residentId).success) return { data: null, error: 'Invalid resident' };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, house_id, charge_category, period_start, amount_due, amount_paid, status, house:houses(house_number, short_name, street:streets(name))')
        .eq('resident_id', residentId)
        .in('status', ['unpaid', 'partially_paid'])
        .order('period_start', { ascending: true })
        .order('id', { ascending: true });
    if (error) {
        console.error('Error loading write-off candidates:', { residentId, error });
        return { data: null, error: error.message };
    }

    const rows = (data || [])
        .map((row) => ({
            id: row.id,
            invoice_number: row.invoice_number,
            house_id: row.house_id,
            house_label: labelHouse(row.house),
            charge_category: row.charge_category,
            period_start: row.period_start,
            amount_due: Number(row.amount_due) || 0,
            amount_paid: Number(row.amount_paid) || 0,
            status: row.status as WriteOffCandidate['status'],
        }))
        .filter((row) => row.amount_due - row.amount_paid > 0);
    return { data: rows, error: null };
}

/** Writes off the selected open bills of one resident in one transaction. */
export async function writeOffInvoices(input: z.input<typeof writeOffSchema>): Promise<{
    success: boolean;
    error: string | null;
    batchId?: string;
    count?: number;
    total?: number;
}> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

    const parsed = writeOffSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Invalid write-off request' };
    const { residentId, invoiceIds, reason, note } = parsed.data;
    const ids = [...new Set(invoiceIds)];

    const supabase = await createServerSupabaseClient();
    // The RPC refuses bills of two residents; this also refuses bills of a different resident than the one on screen.
    const { count, error: ownerError } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .in('id', ids)
        .eq('resident_id', residentId);
    if (ownerError) return { success: false, error: ownerError.message };
    if (count !== ids.length) return { success: false, error: 'Every bill must belong to this resident' };

    const { data, error } = await (supabase as unknown as RpcClient).rpc('write_off_invoices', {
        p_invoice_ids: ids,
        p_reason: reason,
        p_note: note,
        p_actor: auth.userId,
    });
    if (error || !data || data.success !== true || typeof data.batch_id !== 'string') {
        if (error) console.error('write_off_invoices failed:', { residentId, error });
        return { success: false, error: data?.error || error?.message || 'Write-off failed' };
    }
    const total = Number(data.total) || 0;
    const name = await residentName(supabase, residentId);

    await logAudit({
        action: 'UPDATE',
        entityType: 'invoice_write_offs',
        entityId: data.batch_id,
        entityDisplay: `Write-off of ${data.count} bills (${formatCurrency(total)}) for ${name}`,
        newValues: {
            batch_id: data.batch_id,
            resident_id: residentId,
            invoice_ids: data.invoice_ids ?? ids,
            count: data.count,
            total,
            reason,
            reason_label: WRITE_OFF_REASON_LABELS[reason],
            note,
        },
    });

    revalidateResident(residentId);
    return { success: true, error: null, batchId: data.batch_id, count: data.count, total };
}

/** Undoes one write-off: every bill of the batch goes back to how it was. */
export async function undoWriteOff(batchId: string): Promise<{ success: boolean; error: string | null; count?: number; total?: number }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };
    if (!z.string().uuid().safeParse(batchId).success) return { success: false, error: 'Invalid write-off' };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as unknown as RpcClient).rpc('undo_invoice_write_off', { p_batch_id: batchId });
    if (error || !data || data.success !== true) {
        if (error) console.error('undo_invoice_write_off failed:', { batchId, error });
        return { success: false, error: data?.error || error?.message || 'Undo failed' };
    }
    const total = Number(data.total) || 0;
    const name = data.resident_id ? await residentName(supabase, data.resident_id) : 'resident';

    await logAudit({
        action: 'UPDATE',
        entityType: 'invoice_write_offs',
        entityId: batchId,
        entityDisplay: `Undo of write-off of ${data.count} bills (${formatCurrency(total)}) for ${name}`,
        oldValues: { batch_id: batchId, invoice_ids: data.invoice_ids, count: data.count, total, written_off: true },
        newValues: { batch_id: batchId, written_off: false },
    });

    revalidateResident(data.resident_id);
    return { success: true, error: null, count: data.count, total };
}
