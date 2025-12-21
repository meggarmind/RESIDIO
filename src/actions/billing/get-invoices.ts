'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizeSearchInput } from '@/lib/utils';
import type { InvoiceWithDetails, InvoiceStatus, InvoiceType } from '@/types/database';

// Note: InvoiceWithDetails is now imported from @/types/database directly where needed

type GetInvoicesParams = {
    status?: InvoiceStatus;
    invoiceType?: InvoiceType;
    residentId?: string;
    houseId?: string;
    search?: string;
    page?: number;
    limit?: number;
}

type GetInvoicesResponse = {
    data: InvoiceWithDetails[];
    total: number;
    error: string | null;
}

export async function getInvoices(params: GetInvoicesParams = {}): Promise<GetInvoicesResponse> {
    const supabase = await createServerSupabaseClient();
    const { status, invoiceType, residentId, houseId, search, page = 1, limit = 20 } = params;

    let query = supabase
        .from('invoices')
        .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code),
      house:houses(id, house_number, street:streets(name)),
      billing_profile:billing_profiles(id, name),
      invoice_items(id, description, amount)
    `, { count: 'exact' })
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }
    if (invoiceType) {
        query = query.eq('invoice_type', invoiceType);
    }
    if (residentId) {
        query = query.eq('resident_id', residentId);
    }
    if (houseId) {
        query = query.eq('house_id', houseId);
    }
    if (search) {
        const sanitized = sanitizeSearchInput(search);
        query = query.or(`invoice_number.ilike.%${sanitized}%`);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
        return { data: [], total: 0, error: error.message };
    }

    return {
        data: (data as any) || [],
        total: count || 0,
        error: null,
    };
}

export async function getInvoiceById(id: string): Promise<{ data: InvoiceWithDetails | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('invoices')
        .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code, phone_primary, email),
      house:houses(id, house_number, street:streets(name)),
      billing_profile:billing_profiles(id, name),
      invoice_items(id, description, amount)
    `)
        .eq('id', id)
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: data as any, error: null };
}

type ResidentIndebtedness = {
    totalUnpaid: number;
    invoiceCount: number;
    unpaidCount: number;
    partiallyPaidCount: number;
}

export async function getResidentIndebtedness(residentId: string): Promise<{ data: ResidentIndebtedness | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // Get all invoices for the resident except void ones
    const { data, error } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid, status')
        .eq('resident_id', residentId)
        .neq('status', 'void');

    console.log('[getResidentIndebtedness] residentId:', residentId);
    console.log('[getResidentIndebtedness] query result:', { data, error });

    if (error) {
        console.error('[getResidentIndebtedness] error:', error);
        return { data: null, error: error.message };
    }

    const indebtedness: ResidentIndebtedness = {
        totalUnpaid: 0,
        invoiceCount: 0,
        unpaidCount: 0,
        partiallyPaidCount: 0,
    };

    // Calculate unpaid balance from all invoices where amount_paid < amount_due
    data?.forEach((invoice) => {
        const unpaidAmount = (invoice.amount_due || 0) - (invoice.amount_paid || 0);
        if (unpaidAmount > 0) {
            indebtedness.totalUnpaid += unpaidAmount;
            indebtedness.invoiceCount++;
            if (invoice.status === 'unpaid') {
                indebtedness.unpaidCount++;
            } else if (invoice.status === 'partially_paid') {
                indebtedness.partiallyPaidCount++;
            }
        }
    });

    return { data: indebtedness, error: null };
}

