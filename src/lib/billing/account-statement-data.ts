import type { SupabaseClient } from '@supabase/supabase-js';
import type { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import type { InvoiceStatus, InvoiceType } from '@/types/database';
import { buildStatementLedger, MIRRORED_WALLET_REFERENCES, type LedgerWalletTransaction } from '@/lib/billing/statement-ledger';
import { fetchAccountBalance, type AccountBalance } from '@/lib/billing/account-balance';
import {
    buildCategorySections,
    buildCollectionsSection,
    categoryOf,
    type CollectionPaymentRow,
} from '@/lib/billing/statement-categories';

type StatementClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>;

// Dates are interpolated into PostgREST or-filters, so only plain YYYY-MM-DD is accepted.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The instant a Lagos calendar day starts, `addDays` after `date` (Africa/Lagos is UTC+1 all year). */
function lagosDayStart(date: string, addDays = 0): string {
    return new Date(Date.parse(`${date}T00:00:00+01:00`) + addDays * 86_400_000).toISOString();
}

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
    // Set on a summary line: how many monthly invoices it combines.
    invoice_count?: number;
};

export type StatementSummary = {
    totalInvoiced: number;
    totalPaid: number;
    totalCredits: number;
    totalDebits: number;
    netChange: number;
};

/** One wallet category on a statement (#1196): its own opening, running balance and closing. */
export type CategoryStatementSection = {
    code: string;
    name: string;
    openingBalance: number;
    closingBalance: number;
    summary: StatementSummary;
    transactions: StatementTransaction[];
};

/** A collection payment the resident made in the period (#1196). It never changes a balance. */
export type CollectionStatementLine = {
    id: string;
    date: string;
    collection_name: string;
    receipt_number: string;
    reference: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number;
};

export type CollectionsStatementSection = {
    lines: CollectionStatementLine[];
    total: number;
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
    summary: StatementSummary;
    // Transaction list (chronological), every category together
    transactions: StatementTransaction[];
    // One section per wallet category with activity or a balance, each with its own running balance (#1196)
    categories: CategoryStatementSection[];
    // Collection payments in the period; absent when there are none
    collections?: CollectionsStatementSection;
    // Every monthly invoice line, present only when the summary statement asks for the appendix.
    monthlyDetail?: StatementTransaction[];
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
 * Shows all invoices, payments, and wallet transactions for a date range.
 *
 * `rollForward` takes the balances and totals from resident_account_balance (#863) and lists
 * only the rows it counts: verified payments, wallet rows on an all-properties statement only.
 * The admin statement always sets it; resident-facing statements set it only once
 * balance_roll_forward_resident_enabled is on. Without it the statement is built as before #863.
 * Either way, timestamp columns are bounded by the Lagos day (#945).
 * `mode: 'summary'` folds each run of unpaid monthly invoices into one line (#1144, #1234); balances
 * and totals are unchanged. The admin statement dialog and WhatsApp ask for it; the default is detailed.
 */
export async function loadAccountStatement(
    supabase: StatementClient,
    params: GetAccountStatementParams,
    { rollForward, mode = 'detailed', includeMonthlyDetail = false }: { rollForward: boolean; mode?: 'detailed' | 'summary'; includeMonthlyDetail?: boolean }
): Promise<GetAccountStatementResponse> {
    const { residentId, houseId, fromDate, toDate } = params;

    // Shape alone passes 2026-13-45, which would make lagosDayStart throw.
    const validDate = (d: string) => {
        const t = ISO_DATE.test(d) ? Date.parse(`${d}T00:00:00Z`) : NaN;
        return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
    };
    if (!validDate(fromDate) || !validDate(toDate)) {
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
    const createdInPeriod = `created_at.gte."${lagosDayStart(fromDate)}",created_at.lt."${lagosDayStart(toDate, 1)}"`;
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
            charge_category,
            billing_profile:billing_profiles(name)
        `)
        .eq('resident_id', residentId)
        .neq('status', 'void')
        .or(`and(period_start.gte.${fromDate},period_start.lte.${toDate}),and(period_start.is.null,${createdInPeriod})`);

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
        .select('id, amount, payment_date, reference_number, method, notes, charge_category')
        .eq('resident_id', residentId)
        .eq('status', 'paid')
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
        .order('payment_date', { ascending: true });

    if (houseId) {
        paymentQuery = paymentQuery.eq('house_id', houseId);
    }
    // An unverified payment is not in the balance (#804 decision 18), so it is not a row either.
    if (rollForward) {
        paymentQuery = paymentQuery.eq('is_verified', true);
    }

    const { data: payments, error: paymentError } = await paymentQuery;

    if (paymentError) {
        return { data: null, error: paymentError.message };
    }

    // 5. Get wallet transactions in period, across the resident's wallets (one per charge category,
    // #1189); a wallet is not per property, so a roll-forward statement for one house leaves them
    // out (#863 decision 7).
    let walletTransactions: LedgerWalletTransaction[] = [];
    const walletCategories = new Map<string, string>();

    if (!(rollForward && houseId)) {
        const { data: wallets } = await supabase
            .from('resident_wallets')
            .select('id, charge_category')
            .eq('resident_id', residentId);

        for (const wallet of wallets || []) walletCategories.set(wallet.id, wallet.charge_category);

        if (wallets && wallets.length > 0) {
            let walletQuery = supabase
                .from('wallet_transactions')
                .select('id, wallet_id, type, amount, description, reference_type, reference_id, created_at')
                .in('wallet_id', wallets.map((wallet) => wallet.id));
            walletQuery = walletQuery.gte('created_at', lagosDayStart(fromDate)).lt('created_at', lagosDayStart(toDate, 1));
            const { data: walletTx } = await walletQuery.order('created_at', { ascending: true });

            walletTransactions = (walletTx || []).map((tx) => ({
                ...tx,
                charge_category: walletCategories.get(tx.wallet_id) ?? null,
            })) as LedgerWalletTransaction[];
        }
    }

    // 6. Calculate opening balance
    let openingBalance = 0;
    let balance: AccountBalance | null = null;
    const categoryOpenings = new Map<string, number>();
    const addOpening = (code: string, amount: number) => categoryOpenings.set(code, (categoryOpenings.get(code) ?? 0) + amount);

    if (rollForward) {
        try {
            balance = await fetchAccountBalance(supabase, { residentId, houseId, fromDate, toDate });
        } catch (error) {
            console.error('[account-statement] balance read failed', { residentId, houseId, fromDate, toDate, error });
            return { data: null, error: error instanceof Error ? error.message : 'Account balance could not be read' };
        }
        openingBalance = balance.openingBalance;

        // The same rows the balance counts, before the period, split by category (#1196).
        const before = lagosDayStart(fromDate);
        let priorInvoices = supabase
            .from('invoices')
            .select('amount_due, charge_category')
            .eq('resident_id', residentId)
            .neq('status', 'void')
            .or(`period_start.lt.${fromDate},and(period_start.is.null,created_at.lt."${before}")`);
        let priorPayments = supabase
            .from('payment_records')
            .select('amount, charge_category')
            .eq('resident_id', residentId)
            .eq('status', 'paid')
            .eq('is_verified', true)
            .lt('payment_date', fromDate);
        if (houseId) {
            priorInvoices = priorInvoices.eq('house_id', houseId);
            priorPayments = priorPayments.eq('house_id', houseId);
        }
        const [invoicesBefore, paymentsBefore, walletBefore] = await Promise.all([
            priorInvoices,
            priorPayments,
            walletCategories.size > 0
                ? supabase.from('wallet_transactions').select('wallet_id, type, amount, reference_type').in('wallet_id', [...walletCategories.keys()]).lt('created_at', before)
                : Promise.resolve({ data: [], error: null }),
        ]);
        const failed = invoicesBefore.error || paymentsBefore.error || walletBefore.error;
        if (failed) {
            console.error('[account-statement] category opening read failed', { residentId, houseId, fromDate, error: failed });
            return { data: null, error: failed.message };
        }
        for (const row of invoicesBefore.data || []) addOpening(categoryOf(row), row.amount_due || 0);
        for (const row of paymentsBefore.data || []) addOpening(categoryOf(row), -(row.amount || 0));
        for (const row of walletBefore.data || []) {
            if (row.reference_type && MIRRORED_WALLET_REFERENCES.has(row.reference_type)) continue;
            addOpening(walletCategories.get(row.wallet_id) ?? 'dues', row.type === 'credit' ? -row.amount : row.amount);
        }
    } else {
        // Invoices billed before fromDate, less what is allocated to them today
        let priorInvoiceQuery = supabase
            .from('invoices')
            .select('amount_due, amount_paid, charge_category')
            .eq('resident_id', residentId)
            .neq('status', 'void')
            .or(`period_start.lt.${fromDate},and(period_start.is.null,created_at.lt."${lagosDayStart(fromDate)}")`);

        if (houseId) {
            priorInvoiceQuery = priorInvoiceQuery.eq('house_id', houseId);
        }

        const { data: priorInvoices } = await priorInvoiceQuery;

        if (priorInvoices) {
            priorInvoices.forEach((inv) => {
                const owed = (inv.amount_due || 0) - (inv.amount_paid || 0);
                openingBalance += owed;
                addOpening(categoryOf(inv), owed);
            });
        }
    }

    // 7-8. Build the chronological ledger and its totals
    const ledgerInvoices = (invoices || []).map((invoice) => {
        // billing_profile can be array or single object depending on Supabase relationship
        const bpData = invoice.billing_profile as { name: string }[] | { name: string } | null;
        const billingProfile = Array.isArray(bpData) ? bpData[0] : bpData;
        return { ...invoice, billing_profile_name: billingProfile?.name ?? null };
    });
    const ledger = buildStatementLedger({
        openingBalance,
        invoices: ledgerInvoices,
        payments: payments || [],
        walletTransactions,
        mode,
    });
    const { transactions } = ledger;
    let { summary, closingBalance } = ledger;

    if (balance) {
        // Rows and totals come from two reads of the same data; a gap means one of them is wrong.
        if (Math.abs(ledger.closingBalance - balance.closingBalance) >= 0.005) {
            console.error('[account-statement] rows disagree with resident_account_balance', {
                residentId, houseId, fromDate, toDate, rowsClosing: ledger.closingBalance, balanceClosing: balance.closingBalance,
            });
        }
        summary = {
            totalInvoiced: balance.totalInvoiced,
            totalPaid: balance.totalPaid,
            totalCredits: balance.totalCredits,
            totalDebits: balance.totalDebits,
            netChange: Math.round((balance.closingBalance - balance.openingBalance) * 100) / 100,
        };
        closingBalance = balance.closingBalance;
    }

    // 9. Category sections, each its own ledger, and the Collections the resident paid into (#1196)
    const { data: categoryRows } = await supabase
        .from('charge_categories')
        .select('code, name')
        .order('sort_order', { ascending: true });
    const categories = buildCategorySections({
        categories: categoryRows || [],
        openings: categoryOpenings,
        invoices: ledgerInvoices,
        payments: payments || [],
        walletTransactions,
        mode,
    });
    const categoriesClosing = categories.reduce((sum, section) => sum + section.closingBalance, 0);
    if (Math.abs(categoriesClosing - closingBalance) >= 0.005) {
        console.error('[account-statement] category sections disagree with the closing balance', {
            residentId, houseId, fromDate, toDate, categoriesClosing, closingBalance,
        });
    }

    const collectionsResult = await loadCollectionPayments(supabase, { residentId, houseId, fromDate, toDate });
    if (collectionsResult.error) return { data: null, error: collectionsResult.error };

    // 10. Get current user for generated by
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
        categories,
        collections: buildCollectionsSection(collectionsResult.rows),
        monthlyDetail: mode === 'summary' && includeMonthlyDetail ? ledger.monthlyInvoices : undefined,
        generatedAt: new Date().toISOString(),
        generatedBy,
    };

    return { data: statementData, error: null };
}

/**
 * What the resident paid into Collections in the period, newest last (#1196). Collections are money that
 * is not billing, so these rows only list; they never touch a balance. A payment recorded against a house
 * shows on that house's statement only; one with no house shows on every statement of the resident.
 * The collections tables are not in the generated types, hence the cast. Reading them needs collections.view.
 */
async function loadCollectionPayments(
    supabase: StatementClient,
    { residentId, houseId, fromDate, toDate }: { residentId: string; houseId?: string | null; fromDate: string; toDate: string }
): Promise<{ rows: CollectionPaymentRow[]; error: string | null }> {
    const client = supabase as unknown as SupabaseClient;
    const { data: payer, error: payerError } = await client
        .from('collection_payers')
        .select('id')
        .eq('resident_id', residentId)
        .maybeSingle();
    if (payerError) return { rows: [], error: payerError.message };
    if (!payer) return { rows: [], error: null };

    const { data, error } = await client
        .from('collection_payments')
        .select('id, amount, quantity, unit_price, payment_date, reference, receipt_number, house_id, collection:collections!collection_id(name)')
        .eq('payer_id', payer.id)
        .is('reversed_at', null)
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
        .order('payment_date', { ascending: true })
        .order('created_at', { ascending: true });
    if (error) return { rows: [], error: error.message };

    const rows = ((data || []) as unknown as Array<CollectionPaymentRow & { house_id: string | null }>)
        .filter((row) => !houseId || !row.house_id || row.house_id === houseId);
    return { rows, error: null };
}
