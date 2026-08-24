'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { sanitizeSearchInput } from '@/lib/utils';
import type { InvoiceWithDetails, InvoiceStatus, InvoiceType } from '@/types/database';

// Note: InvoiceWithDetails is now imported from @/types/database directly where needed

type GetInvoicesParams = {
    status?: InvoiceStatus;
    invoiceType?: InvoiceType;
    residentId?: string;
    houseId?: string;
    search?: string;
    periodFrom?: string;
    periodTo?: string;
    page?: number;
    limit?: number;
}

type GetInvoicesResponse = {
    data: InvoiceWithDetails[];
    total: number;
    error: string | null;
}

type BillingResidentFilterOption = {
    id: string;
    first_name: string;
    last_name: string;
    aliases: string[];
};

export async function getBillingResidentFilterOptions(): Promise<{
    data: BillingResidentFilterOption[] | null;
    error: string | null;
}> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_payment_aliases(alias_name, is_active)')
        .order('first_name')
        .order('last_name');

    if (error) {
        return { data: null, error: error.message };
    }

    return {
        data: (data ?? []).map((resident) => ({
            id: resident.id,
            first_name: resident.first_name,
            last_name: resident.last_name,
            aliases: resident.resident_payment_aliases
                .filter((alias) => alias.is_active)
                .map((alias) => alias.alias_name),
        })),
        error: null,
    };
}

export async function getInvoices(params: GetInvoicesParams = {}): Promise<GetInvoicesResponse> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: [], total: 0, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();
    const { status, invoiceType, residentId, houseId, search, periodFrom, periodTo, page = 1, limit = 20 } = params;

    let query = supabase
        .from('invoices')
        .select(`
      id, invoice_number, resident_id, house_id, billing_profile_id,
      amount_due, amount_paid, status, invoice_type, due_date,
      rate_snapshot, period_start, period_end, notes, created_at,
      updated_at, created_by, is_correction, parent_invoice_id, correction_type,
      resident:residents(id, first_name, last_name, resident_code),
      house:houses(id, house_number, short_name, street:streets(name)),
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
    if (periodFrom) {
        query = query.gte('period_start', periodFrom);
    }
    if (periodTo) {
        query = query.lte('period_start', periodTo);
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
        data: (data as unknown as InvoiceWithDetails[]) || [],
        total: count || 0,
        error: null,
    };
}

export async function getInvoiceById(id: string): Promise<{ data: InvoiceWithDetails | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('invoices')
        .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code, phone_primary, email),
      house:houses(id, house_number, short_name, street:streets(name)),
      billing_profile:billing_profiles(id, name),
      invoice_items(id, description, amount)
    `)
        .eq('id', id)
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: data as unknown as InvoiceWithDetails, error: null };
}

type ResidentIndebtedness = {
    totalUnpaid: number;
    invoiceCount: number;
    unpaidCount: number;
    partiallyPaidCount: number;
}

export async function getResidentIndebtedness(residentId: string): Promise<{ data: ResidentIndebtedness | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc('get_resident_indebtedness', { p_resident_id: residentId });

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: data as ResidentIndebtedness, error: null };
}

// House Payment Status - aggregate all invoices for a house across all residents
export type HousePaymentStatus = {
    totalDue: number;
    totalPaid: number;
    totalOutstanding: number;
    invoiceCount: number;
    unpaidCount: number;
    partiallyPaidCount: number;
    paidCount: number;
    overdueCount: number;
    overdueAmount: number;
    residents: Array<{
        residentId: string;
        residentName: string;
        residentCode: string;
        totalDue: number;
        totalPaid: number;
        outstanding: number;
        invoiceCount: number;
    }>;
};

export async function getHousePaymentStatus(houseId: string): Promise<{ data: HousePaymentStatus | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc('get_house_payment_status', { p_house_id: houseId });

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: data as HousePaymentStatus, error: null };
}

// Cross-Property Payment Summary for a Resident
export type ResidentCrossPropertyPaymentSummary = {
    totalDue: number;
    totalPaid: number;
    totalOutstanding: number;
    totalInvoices: number;
    properties: Array<{
        houseId: string;
        houseNumber: string;
        streetName: string;
        isCurrentProperty: boolean;
        totalDue: number;
        totalPaid: number;
        outstanding: number;
        invoiceCount: number;
        unpaidCount: number;
        overdueCount: number;
    }>;
};

export async function getResidentCrossPropertyPaymentSummary(residentId: string): Promise<{ data: ResidentCrossPropertyPaymentSummary | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.rpc('get_resident_cross_property_payment_summary', { p_resident_id: residentId });

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: data as ResidentCrossPropertyPaymentSummary, error: null };
}
