'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type OverdueInvoice = {
    id: string;
    invoice_number: string;
    amount_due: number;
    amount_paid: number;
    due_date: string;
    days_overdue: number;
    resident: {
        id: string;
        first_name: string;
        last_name: string;
        resident_code: string;
        email?: string;
        phone_primary?: string;
    };
    house?: {
        house_number: string;
        street?: {
            name: string;
        };
    };
}

export async function checkOverdueInvoices() {
    const supabase = await createServerSupabaseClient();

    // Get today's date in ISO format (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // Find all invoices where:
    // - status is 'unpaid' or 'partially_paid'
    // - due_date is before today
    const { data, error } = await supabase
        .from('invoices')
        .select(`
            id,
            invoice_number,
            amount_due,
            amount_paid,
            due_date,
            status,
            resident:residents(
                id,
                first_name,
                last_name,
                resident_code,
                email,
                phone_primary
            ),
            house:houses(
                house_number,
                street:streets(name)
            )
        `)
        .in('status', ['unpaid', 'partially_paid'])
        .lt('due_date', today)
        .order('due_date', { ascending: true });

    if (error) {
        return { error: error.message };
    }

    // Calculate days overdue for each invoice
    const overdueInvoices: OverdueInvoice[] = (data || []).map((invoice) => {
        const dueDate = new Date(invoice.due_date);
        const todayDate = new Date(today);
        const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        // Supabase returns single relations as objects, but TypeScript infers arrays
        // Use type assertion with unknown to handle this
        const resident = invoice.resident as unknown as OverdueInvoice['resident'];
        const house = invoice.house as unknown as OverdueInvoice['house'];

        return {
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            due_date: invoice.due_date,
            days_overdue: daysOverdue,
            resident,
            house,
        };
    });

    // Group by resident for summary
    const byResident = overdueInvoices.reduce((acc, invoice) => {
        const residentId = invoice.resident.id;
        if (!acc[residentId]) {
            acc[residentId] = {
                resident: invoice.resident,
                invoices: [],
                totalOwed: 0,
            };
        }
        acc[residentId].invoices.push(invoice);
        acc[residentId].totalOwed += (invoice.amount_due - invoice.amount_paid);
        return acc;
    }, {} as Record<string, { resident: OverdueInvoice['resident']; invoices: OverdueInvoice[]; totalOwed: number }>);

    revalidatePath('/billing');

    return {
        success: true,
        data: {
            overdueInvoices,
            totalOverdue: overdueInvoices.length,
            totalAmount: overdueInvoices.reduce((sum, inv) => sum + (inv.amount_due - inv.amount_paid), 0),
            byResident: Object.values(byResident),
        },
    };
}

// Get summary stats for overdue invoices (for dashboard widget)
export async function getOverdueStats() {
    const supabase = await createServerSupabaseClient();

    const today = new Date().toISOString().split('T')[0];

    const { data, error, count } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid', { count: 'exact' })
        .in('status', ['unpaid', 'partially_paid'])
        .lt('due_date', today);

    if (error) {
        return { error: error.message };
    }

    const totalAmount = (data || []).reduce((sum, inv) => sum + (inv.amount_due - inv.amount_paid), 0);

    return {
        success: true,
        data: {
            count: count || 0,
            totalAmount,
        },
    };
}
