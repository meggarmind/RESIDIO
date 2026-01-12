'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { InvoiceStatus, InvoiceType } from '@/types/database';

// ============================================================
// Account Statement Types
// ============================================================

export type StatementTransaction = {
    id: string;
    date: string;
    type: 'invoice' | 'payment' | 'wallet_credit' | 'wallet_debit';
    description: string;
    reference: string | null;
    debit: number;   // Amount charged/owed
    credit: number;  // Amount paid/credited
    balance: number; // Running balance
    // Additional details for linking
    invoice_id?: string | null;
    payment_id?: string | null;
    invoice_status?: InvoiceStatus;
    invoice_type?: InvoiceType;
    period?: string;
};

export type AccountStatementData = {
    // Resident info
    resident: {
        id: string;
        name: string;
        resident_code: string;
        email: string | null;
        phone: string | null;
        entity_type: string;
        company_name: string | null;
    };
    // House info (if filtered by house)
    house: {
        id: string;
        address: string;
        short_name: string | null;
    } | null;
    // Statement period
    period: {
        from: string;
        to: string;
    };
    // Opening balance at start of period
    openingBalance: number;
    // Closing balance at end of period
    closingBalance: number;
    // Summary totals
    summary: {
        totalInvoiced: number;
        totalPaid: number;
        totalCredits: number;
        totalDebits: number;
        netChange: number;
    };
    // Transaction list (chronological)
    transactions: StatementTransaction[];
    // Generated metadata
    generatedAt: string;
    generatedBy: string | null;
};

type GetAccountStatementParams = {
    residentId: string;
    houseId?: string | null;
    fromDate: string;
    toDate: string;
};

type GetAccountStatementResponse = {
    data: AccountStatementData | null;
    error: string | null;
};

/**
 * Get comprehensive account statement for a resident
 * Shows all invoices, payments, and wallet transactions for a date range
 */
export async function getAccountStatement(
    params: GetAccountStatementParams
): Promise<GetAccountStatementResponse> {
    const supabase = await createServerSupabaseClient();
    const { residentId, houseId, fromDate, toDate } = params;

    // 1. Get resident details
    const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, email, phone_primary, entity_type, company_name')
        .eq('id', residentId)
        .single();

    if (residentError || !resident) {
        return { data: null, error: residentError?.message || 'Resident not found' };
    }

    // 2. Get house details if filtering by house
    let houseData: AccountStatementData['house'] = null;
    if (houseId) {
        const { data: house } = await supabase
            .from('houses')
            .select('id, house_number, short_name, street:streets(name)')
            .eq('id', houseId)
            .single();

        if (house) {
            // Street can be array or single object depending on Supabase relationship
            const streetData = house.street as { name: string }[] | { name: string } | null;
            const streetName = Array.isArray(streetData)
                ? streetData[0]?.name
                : streetData?.name;
            houseData = {
                id: house.id,
                address: `${house.house_number}, ${streetName || 'Unknown Street'}`,
                short_name: house.short_name,
            };
        }
    }

    // 3. Get invoices in period (excluding void)
    let invoiceQuery = supabase
        .from('invoices')
        .select(`
            id,
            invoice_number,
            amount_due,
            amount_paid,
            status,
            invoice_type,
            period_start,
            period_end,
            due_date,
            created_at,
            billing_profile:billing_profiles(name)
        `)
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .gte('created_at', fromDate)
        .lte('created_at', toDate)
        .order('created_at', { ascending: true });

    if (houseId) {
        invoiceQuery = invoiceQuery.eq('house_id', houseId);
    }

    const { data: invoices, error: invoiceError } = await invoiceQuery;

    if (invoiceError) {
        return { data: null, error: invoiceError.message };
    }

    // 4. Get payments in period
    let paymentQuery = supabase
        .from('payment_records')
        .select('id, amount, payment_date, reference, method, notes')
        .eq('resident_id', residentId)
        .eq('status', 'paid')
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
        .order('payment_date', { ascending: true });

    if (houseId) {
        paymentQuery = paymentQuery.eq('house_id', houseId);
    }

    const { data: payments, error: paymentError } = await paymentQuery;

    if (paymentError) {
        return { data: null, error: paymentError.message };
    }

    // 5. Get wallet transactions in period
    const { data: wallet } = await supabase
        .from('resident_wallets')
        .select('id')
        .eq('resident_id', residentId)
        .single();

    let walletTransactions: Array<{
        id: string;
        type: 'credit' | 'debit';
        amount: number;
        description: string | null;
        reference_type: string | null;
        reference_id: string | null;
        created_at: string;
    }> = [];

    if (wallet) {
        const { data: walletTx } = await supabase
            .from('wallet_transactions')
            .select('id, type, amount, description, reference_type, reference_id, created_at')
            .eq('wallet_id', wallet.id)
            .gte('created_at', fromDate)
            .lte('created_at', toDate)
            .order('created_at', { ascending: true });

        walletTransactions = walletTx || [];
    }

    // 6. Calculate opening balance (all transactions before fromDate)
    let openingBalance = 0;

    // Invoices before period
    let priorInvoiceQuery = supabase
        .from('invoices')
        .select('amount_due, amount_paid')
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .lt('created_at', fromDate);

    if (houseId) {
        priorInvoiceQuery = priorInvoiceQuery.eq('house_id', houseId);
    }

    const { data: priorInvoices } = await priorInvoiceQuery;

    if (priorInvoices) {
        priorInvoices.forEach((inv) => {
            openingBalance += (inv.amount_due || 0) - (inv.amount_paid || 0);
        });
    }

    // 7. Build transaction list
    const transactions: StatementTransaction[] = [];
    let runningBalance = openingBalance;

    // Add invoices as debits
    (invoices || []).forEach((invoice) => {
        // billing_profile can be array or single object depending on Supabase relationship
        const bpData = invoice.billing_profile as { name: string }[] | { name: string } | null;
        const billingProfile = Array.isArray(bpData) ? bpData[0] : bpData;
        const periodStr = invoice.period_start && invoice.period_end
            ? `${formatPeriodDate(invoice.period_start)} - ${formatPeriodDate(invoice.period_end)}`
            : null;

        runningBalance += invoice.amount_due || 0;

        transactions.push({
            id: `inv-${invoice.id}`,
            date: invoice.created_at,
            type: 'invoice',
            description: `Invoice #${invoice.invoice_number}${billingProfile ? ` - ${billingProfile.name}` : ''}`,
            reference: invoice.invoice_number,
            debit: invoice.amount_due || 0,
            credit: 0,
            balance: runningBalance,
            invoice_id: invoice.id,
            invoice_status: invoice.status as InvoiceStatus,
            invoice_type: invoice.invoice_type as InvoiceType,
            period: periodStr || undefined,
        });
    });

    // Add payments as credits
    (payments || []).forEach((payment) => {
        runningBalance -= payment.amount || 0;

        transactions.push({
            id: `pay-${payment.id}`,
            date: payment.payment_date,
            type: 'payment',
            description: `Payment${payment.method ? ` (${payment.method})` : ''}${payment.notes ? ` - ${payment.notes}` : ''}`,
            reference: payment.reference,
            debit: 0,
            credit: payment.amount || 0,
            balance: runningBalance,
            payment_id: payment.id,
        });
    });

    // Add wallet transactions (only non-invoice related - those are already reflected)
    walletTransactions.forEach((tx) => {
        // Skip wallet debits for invoice payments (already covered by payment records)
        if (tx.reference_type === 'invoice') {
            return;
        }

        if (tx.type === 'credit') {
            // Wallet credits reduce outstanding balance
            runningBalance -= tx.amount;
            transactions.push({
                id: `wtx-${tx.id}`,
                date: tx.created_at,
                type: 'wallet_credit',
                description: tx.description || 'Wallet Credit',
                reference: tx.reference_id,
                debit: 0,
                credit: tx.amount,
                balance: runningBalance,
            });
        } else {
            // Non-invoice wallet debits increase balance (e.g., manual adjustments)
            runningBalance += tx.amount;
            transactions.push({
                id: `wtx-${tx.id}`,
                date: tx.created_at,
                type: 'wallet_debit',
                description: tx.description || 'Wallet Debit',
                reference: tx.reference_id,
                debit: tx.amount,
                credit: 0,
                balance: runningBalance,
            });
        }
    });

    // Sort all transactions by date
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Recalculate running balances after sorting
    let balance = openingBalance;
    transactions.forEach((tx) => {
        balance += tx.debit - tx.credit;
        tx.balance = balance;
    });

    // 8. Calculate summary
    const summary = {
        totalInvoiced: transactions.filter(t => t.type === 'invoice').reduce((sum, t) => sum + t.debit, 0),
        totalPaid: transactions.filter(t => t.type === 'payment').reduce((sum, t) => sum + t.credit, 0),
        totalCredits: transactions.filter(t => t.type === 'wallet_credit').reduce((sum, t) => sum + t.credit, 0),
        totalDebits: transactions.filter(t => t.type === 'wallet_debit').reduce((sum, t) => sum + t.debit, 0),
        netChange: 0,
    };
    summary.netChange = (summary.totalInvoiced + summary.totalDebits) - (summary.totalPaid + summary.totalCredits);

    const closingBalance = openingBalance + summary.netChange;

    // 9. Get current user for generated by
    const { data: { user } } = await supabase.auth.getUser();
    let generatedBy: string | null = null;
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();
        generatedBy = profile?.full_name || user.email || null;
    }

    const statementData: AccountStatementData = {
        resident: {
            id: resident.id,
            name: resident.entity_type === 'corporate'
                ? resident.company_name || `${resident.first_name} ${resident.last_name}`
                : `${resident.first_name} ${resident.last_name}`,
            resident_code: resident.resident_code,
            email: resident.email,
            phone: resident.phone_primary,
            entity_type: resident.entity_type,
            company_name: resident.company_name,
        },
        house: houseData,
        period: {
            from: fromDate,
            to: toDate,
        },
        openingBalance,
        closingBalance,
        summary,
        transactions,
        generatedAt: new Date().toISOString(),
        generatedBy,
    };

    return { data: statementData, error: null };
}

/**
 * Get account statement for the current resident (portal use)
 */
export async function getMyAccountStatement(
    params: Omit<GetAccountStatementParams, 'residentId'> & { houseId?: string }
): Promise<GetAccountStatementResponse> {
    const supabase = await createServerSupabaseClient();

    // Get current user's resident record
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Not authenticated' };
    }

    // Find the resident linked to this profile
    const { data: resident, error: residentError } = await supabase
        .from('residents')
        .select('id')
        .eq('profile_id', user.id)
        .single();

    if (residentError || !resident) {
        return { data: null, error: 'Resident record not found' };
    }

    return getAccountStatement({
        residentId: resident.id,
        houseId: params.houseId,
        fromDate: params.fromDate,
        toDate: params.toDate,
    });
}

// Helper to format period dates
function formatPeriodDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
