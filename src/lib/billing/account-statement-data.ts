import type { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import type { InvoiceStatus, InvoiceType } from '@/types/database';
import { buildStatementLedger, type LedgerWalletTransaction } from '@/lib/billing/statement-ledger';

type StatementClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>;

// Dates are interpolated into PostgREST or-filters, so only plain YYYY-MM-DD is accepted.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export type GetAccountStatementParams = {
    residentId: string;
    houseId?: string | null;
    fromDate: string;
    toDate: string;
};

export type GetAccountStatementResponse = {
    data: AccountStatementData | null;
    error: string | null;
};

/**
 * Builds the account statement for a resident with the given client: the user's client for
 * admin pages, the service-role client for the WhatsApp Assistant (#804), which has no user.
 * Shows all invoices, payments, and wallet transactions for a date range
 */
export async function loadAccountStatement(
    supabase: StatementClient,
    params: GetAccountStatementParams
): Promise<GetAccountStatementResponse> {
    const { residentId, houseId, fromDate, toDate } = params;

    if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
        return { data: null, error: 'Dates must be in YYYY-MM-DD format' };
    }

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

    // 3. Get invoices in period (excluding void), dated by the period they bill.
    // Legacy invoices carry their import date in created_at, so created_at is only the fallback.
    let invoiceQuery = supabase
        .from('invoices')
        .select(`
            id,
            invoice_number,
            amount_due,
            status,
            invoice_type,
            period_start,
            period_end,
            created_at,
            billing_profile:billing_profiles(name)
        `)
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .or(`and(period_start.gte.${fromDate},period_start.lte.${toDate}),and(period_start.is.null,created_at.gte.${fromDate},created_at.lte.${toDate})`);

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
        .select('id, amount, payment_date, reference_number, method, notes')
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

    let walletTransactions: LedgerWalletTransaction[] = [];

    if (wallet) {
        const { data: walletTx } = await supabase
            .from('wallet_transactions')
            .select('id, type, amount, description, reference_type, reference_id, created_at')
            .eq('wallet_id', wallet.id)
            .gte('created_at', fromDate)
            .lte('created_at', toDate)
            .order('created_at', { ascending: true });

        walletTransactions = (walletTx || []) as LedgerWalletTransaction[];
    }

    // 6. Calculate opening balance (invoices billed before fromDate)
    let openingBalance = 0;

    let priorInvoiceQuery = supabase
        .from('invoices')
        .select('amount_due, amount_paid')
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .or(`period_start.lt.${fromDate},and(period_start.is.null,created_at.lt.${fromDate})`);

    if (houseId) {
        priorInvoiceQuery = priorInvoiceQuery.eq('house_id', houseId);
    }

    const { data: priorInvoices } = await priorInvoiceQuery;

    if (priorInvoices) {
        priorInvoices.forEach((inv) => {
            openingBalance += (inv.amount_due || 0) - (inv.amount_paid || 0);
        });
    }

    // 7-8. Build the chronological ledger and its totals
    const { transactions, summary, closingBalance } = buildStatementLedger({
        openingBalance,
        invoices: (invoices || []).map((invoice) => {
            // billing_profile can be array or single object depending on Supabase relationship
            const bpData = invoice.billing_profile as { name: string }[] | { name: string } | null;
            const billingProfile = Array.isArray(bpData) ? bpData[0] : bpData;
            return { ...invoice, billing_profile_name: billingProfile?.name ?? null };
        }),
        payments: payments || [],
        walletTransactions,
    });

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
