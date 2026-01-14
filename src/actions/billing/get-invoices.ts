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
      house:houses(id, house_number, short_name, street:streets(name)),
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
    const supabase = await createServerSupabaseClient();

    // Get all invoices for this house (excluding void ones)
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
            id,
            amount_due,
            amount_paid,
            status,
            resident_id,
            resident:residents(id, first_name, last_name, resident_code)
        `)
        .eq('house_id', houseId)
        .neq('status', 'void');

    if (error) {
        return { data: null, error: error.message };
    }

    if (!invoices || invoices.length === 0) {
        return {
            data: {
                totalDue: 0,
                totalPaid: 0,
                totalOutstanding: 0,
                invoiceCount: 0,
                unpaidCount: 0,
                partiallyPaidCount: 0,
                paidCount: 0,
                overdueCount: 0,
                overdueAmount: 0,
                residents: [],
            },
            error: null,
        };
    }

    const status: HousePaymentStatus = {
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        invoiceCount: invoices.length,
        unpaidCount: 0,
        partiallyPaidCount: 0,
        paidCount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        residents: [],
    };

    // Track per-resident totals
    const residentMap = new Map<string, {
        residentId: string;
        residentName: string;
        residentCode: string;
        totalDue: number;
        totalPaid: number;
        outstanding: number;
        invoiceCount: number;
    }>();

    invoices.forEach((invoice) => {
        const amountDue = invoice.amount_due || 0;
        const amountPaid = invoice.amount_paid || 0;
        const outstanding = amountDue - amountPaid;

        status.totalDue += amountDue;
        status.totalPaid += amountPaid;
        status.totalOutstanding += outstanding > 0 ? outstanding : 0;

        switch (invoice.status) {
            case 'unpaid':
                status.unpaidCount++;
                break;
            case 'partially_paid':
                status.partiallyPaidCount++;
                break;
            case 'paid':
                status.paidCount++;
                break;
            case 'overdue':
                status.overdueCount++;
                status.overdueAmount += outstanding > 0 ? outstanding : 0;
                break;
        }

        // Track per-resident totals
        const residentId = invoice.resident_id;
        // Supabase returns single relations as object, not array
        const resident = invoice.resident as unknown as { id: string; first_name: string; last_name: string; resident_code: string } | null;

        if (residentId && resident) {
            const existing = residentMap.get(residentId);
            if (existing) {
                existing.totalDue += amountDue;
                existing.totalPaid += amountPaid;
                existing.outstanding += outstanding > 0 ? outstanding : 0;
                existing.invoiceCount++;
            } else {
                residentMap.set(residentId, {
                    residentId,
                    residentName: `${resident.first_name} ${resident.last_name}`,
                    residentCode: resident.resident_code,
                    totalDue: amountDue,
                    totalPaid: amountPaid,
                    outstanding: outstanding > 0 ? outstanding : 0,
                    invoiceCount: 1,
                });
            }
        }
    });

    status.residents = Array.from(residentMap.values())
        .sort((a, b) => b.outstanding - a.outstanding); // Sort by outstanding amount descending

    return { data: status, error: null };
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
    const supabase = await createServerSupabaseClient();

    // Get all invoices for this resident across all properties (excluding void ones)
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
            id,
            amount_due,
            amount_paid,
            status,
            house_id,
            house:houses(id, house_number, short_name, street:streets(name))
        `)
        .eq('resident_id', residentId)
        .neq('status', 'void');

    if (error) {
        return { data: null, error: error.message };
    }

    // Get the resident's current active houses
    const { data: residentHouses } = await supabase
        .from('resident_houses')
        .select('house_id')
        .eq('resident_id', residentId)
        .eq('is_active', true);

    const currentHouseIds = new Set((residentHouses || []).map(rh => rh.house_id));

    if (!invoices || invoices.length === 0) {
        return {
            data: {
                totalDue: 0,
                totalPaid: 0,
                totalOutstanding: 0,
                totalInvoices: 0,
                properties: [],
            },
            error: null,
        };
    }

    const summary: ResidentCrossPropertyPaymentSummary = {
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        totalInvoices: invoices.length,
        properties: [],
    };

    // Track per-property totals
    const propertyMap = new Map<string, {
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
    }>();

    invoices.forEach((invoice) => {
        const amountDue = invoice.amount_due || 0;
        const amountPaid = invoice.amount_paid || 0;
        const outstanding = amountDue - amountPaid;

        summary.totalDue += amountDue;
        summary.totalPaid += amountPaid;
        summary.totalOutstanding += outstanding > 0 ? outstanding : 0;

        const houseId = invoice.house_id;
        const house = invoice.house as unknown as { id: string; house_number: string; street: { name: string } } | null;

        if (houseId && house) {
            const existing = propertyMap.get(houseId);
            const isOverdue = invoice.status === 'overdue';
            const isUnpaid = invoice.status === 'unpaid' || invoice.status === 'overdue';

            if (existing) {
                existing.totalDue += amountDue;
                existing.totalPaid += amountPaid;
                existing.outstanding += outstanding > 0 ? outstanding : 0;
                existing.invoiceCount++;
                if (isUnpaid) existing.unpaidCount++;
                if (isOverdue) existing.overdueCount++;
            } else {
                propertyMap.set(houseId, {
                    houseId,
                    houseNumber: house.house_number,
                    streetName: house.street?.name || 'Unknown Street',
                    isCurrentProperty: currentHouseIds.has(houseId),
                    totalDue: amountDue,
                    totalPaid: amountPaid,
                    outstanding: outstanding > 0 ? outstanding : 0,
                    invoiceCount: 1,
                    unpaidCount: isUnpaid ? 1 : 0,
                    overdueCount: isOverdue ? 1 : 0,
                });
            }
        }
    });

    summary.properties = Array.from(propertyMap.values())
        .sort((a, b) => {
            // Current properties first, then by outstanding amount descending
            if (a.isCurrentProperty !== b.isCurrentProperty) {
                return a.isCurrentProperty ? -1 : 1;
            }
            return b.outstanding - a.outstanding;
        });

    return { data: summary, error: null };
}

