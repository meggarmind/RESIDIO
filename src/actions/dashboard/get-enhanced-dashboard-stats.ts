'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission, getCurrentUserPermissions } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatAuditLog, type AuditLogEntry } from '@/lib/audit/audit-formatter';

// ─────────────────────────────────────────────────────────────────
// Enhanced Dashboard Stats Types
// ─────────────────────────────────────────────────────────────────

export interface FinancialHealthMetrics {
    totalOutstanding: number;
    totalCollected: number;
    collectionRate: number;
    monthlyRevenue: number;
    totalMonthlyRevenue: number;
    previousMonthRevenue: number;
    revenueChange: number;
    totalWalletBalance: number;
    portfolioValue: number;
    importedBankNetCash: number;
    pettyCashBalance: number;
    estateCash: number;
    walletCredits: number;
    overdueAmount: number;
    overdueCount: number;
}

export interface InvoiceStatusDistribution {
    unpaid: number;
    paid: number;
    partiallyPaid: number;
    overdue: number;
    void: number;
}

export interface SecurityAlerts {
    expiringCodesCount: number; // within 7 days
    expiredCodesCount: number;
    suspendedContactsCount: number;
    recentFlaggedEntries: number;
    expiringCodes: Array<{
        id: string;
        code: string;
        contactName: string;
        residentName: string;
        validUntil: string;
    }>;
}

export interface DevelopmentLevyStatus {
    totalLeviesGenerated: number;
    totalLevyAmount: number;
    paidLevyAmount: number;
    pendingLevyAmount: number;
    housesWithPendingLevy: number;
}

export interface QuickStats {
    totalHouses: number;
    occupiedHouses: number;
    vacantHouses: number;
    totalResidents: number;
    activeResidents: number;
    pendingVerification: number;
    totalSecurityContacts: number;
    activeSecurityContacts: number;
}

export interface DashboardActionMetrics {
    pendingResidentVerifications: number;
    unverifiedPayments: number;
    expiringSecurityContacts: number;
    totalRequiringAttention: number;
}

export interface RecentActivityItem {
    id: string;
    type: 'payment' | 'resident' | 'invoice' | 'security' | 'import' | 'approval';
    action: string;
    description: string;
    timestamp: string;
    actorName?: string;
    entityName?: string;
    amount?: number;
}

/**
 * Recent activity plus the reason it may be empty.
 *
 * Issue #197: `audit_logs` is guarded by an RLS SELECT policy reading
 * `has_permission('settings.view_audit_logs')`, which six of the eight roles
 * do not hold. A denied read comes back as zero rows, so "you may not see
 * activity" and "nothing has happened" were indistinguishable and the card
 * rendered a misleading empty state. Callers get the distinction explicitly
 * via `permissionDenied` rather than having to infer it from an empty list.
 */
export interface RecentActivityResult {
    items: RecentActivityItem[];
    /** True when the viewer's role lacks `settings.view_audit_logs`. */
    permissionDenied: boolean;
}

export interface MonthlyTrend {
    month: string;
    revenue: number;
    invoicesGenerated: number;
    paymentsReceived: number;
}


export interface EnhancedDashboardStats {
    /** null when the financial section failed to load; consumers must render an unavailable state. */
    financialHealth: FinancialHealthMetrics | null;
    /** null when the invoice-distribution query failed or timed out; consumers must render an unavailable state. */
    invoiceDistribution: InvoiceStatusDistribution | null;
    securityAlerts: SecurityAlerts;
    developmentLevy: DevelopmentLevyStatus;
    /** null when the quick-stats query failed or timed out; consumers must render an unavailable state. */
    quickStats: QuickStats | null;
    recentActivity: RecentActivityItem[];
    /**
     * True when `recentActivity` is empty because the viewer's role cannot read
     * audit logs, rather than because nothing has happened (#197).
     */
    recentActivityUnavailable: boolean;
    monthlyTrends: MonthlyTrend[];
    /** null when the action-metrics query failed or timed out; consumers must not render "All clear" or zero. */
    actionMetrics: DashboardActionMetrics | null;
    lastUpdated: string;
}

// ─────────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────────

export async function getEnhancedDashboardStats(): Promise<{
    data: EnhancedDashboardStats | null;
    error: string | null;
}> {
    const supabase = await createServerSupabaseClient();

    try {
        // One access lookup authenticates the caller and yields the permission set
        // fetchRecentActivity needs, so it is not re-read per section (#775).
        const { userId, permissions } = await getCurrentUserPermissions();

        if (!userId) {
            console.error('[getEnhancedDashboardStats] No active session');
            return { data: null, error: 'Unauthorized' };
        }

        // Overall Action Timeout (15 seconds)
        const totalTimeoutPromise = new Promise<{ data: EnhancedDashboardStats | null; error: string | null }>((_, reject) => {
            setTimeout(() => reject(new Error('Total action timeout: getEnhancedDashboardStats took longer than 15s')), 15000);
        });

        return await Promise.race([
            getStatsWithTimeout(supabase, permissions),
            totalTimeoutPromise
        ]);
    } catch (err) {
        console.error('[getEnhancedDashboardStats] FATAL:', err);
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
        };
    }
}

export async function getAdminDashboardSnapshot(): Promise<{
    data: EnhancedDashboardStats | null;
    error: string | null;
}> {
    const authorization = await authorizePermission(PERMISSIONS.BILLING_VIEW);
    if (!authorization.authorized) {
        return { data: null, error: authorization.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

    try {
        return await getStatsWithTimeout(supabase, authorization.permissions);
    } catch (err) {
        console.error('[getAdminDashboardSnapshot] FATAL:', err);
        return {
            data: null,
            error: err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
        };
    }
}

async function getStatsWithTimeout(
    supabase: SupabaseClient,
    permissions: string[]
): Promise<{ data: EnhancedDashboardStats | null; error: string | null }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Parallel fetch all data with individual timeouts to prevent hanging
    const TIMEOUT = 10000; // 10 seconds per sub-query

    // Financial health and the levy card read the same aggregate; issue it once (#775).
    const financialTotals = fetchFinancialTotals(supabase);
    // Each consumer handles the rejection through its own withTimeout; this only stops an
    // unhandled-rejection report if a consumer never awaits it.
    financialTotals.catch(() => {});

    const [
        financialData,
        invoiceDistribution,
        securityData,
        levyData,
        quickStatsData,
        activityData,
        trendsData,
        actionMetricsData
    ] = await Promise.all([
        withTimeout(
            fetchFinancialHealth(supabase, financialTotals, monthStart, monthEnd, prevMonthStart, prevMonthEnd),
            TIMEOUT,
            null,
            'fetchFinancialHealth'
        ),
        withTimeout(
            fetchInvoiceDistribution(supabase),
            TIMEOUT,
            null,
            'fetchInvoiceDistribution'
        ),
        withTimeout(
            fetchSecurityAlerts(supabase, now, sevenDaysFromNow),
            TIMEOUT,
            null,
            'fetchSecurityAlerts'
        ),
        withTimeout(
            fetchDevelopmentLevyStatus(financialTotals),
            TIMEOUT,
            null,
            'fetchDevelopmentLevyStatus'
        ),
        withTimeout(
            fetchQuickStats(supabase),
            TIMEOUT,
            null,
            'fetchQuickStats'
        ),
        withTimeout(
            fetchRecentActivity(supabase, permissions),
            TIMEOUT,
            null,
            'fetchRecentActivity'
        ),
        withTimeout(
            fetchMonthlyTrends(supabase, now),
            TIMEOUT,
            [],
            'fetchMonthlyTrends'
        ),
        withTimeout(
            fetchActionMetrics(supabase, now, sevenDaysFromNow),
            TIMEOUT,
            null,
            'fetchActionMetrics'
        )
    ]);

    // Check if all major components failed
    if (!quickStatsData && !financialData && !invoiceDistribution) {
        console.error('[getEnhancedDashboardStats] All vital components failed to load.');
        return {
            data: null,
            error: 'Vital dashboard components failed to load. Please check database connectivity.'
        };
    }

    return {
        data: {
            // null (not a zero-filled object) when a section failed, so the UI shows
            // "unavailable" instead of fabricated 0 revenue / 0% collection / "All clear".
            financialHealth: financialData,
            invoiceDistribution,
            securityAlerts: securityData || {
                expiringCodesCount: 0, expiredCodesCount: 0, suspendedContactsCount: 0,
                recentFlaggedEntries: 0, expiringCodes: []
            },
            developmentLevy: levyData || {
                totalLeviesGenerated: 0, totalLevyAmount: 0, paidLevyAmount: 0,
                pendingLevyAmount: 0, housesWithPendingLevy: 0
            },
            quickStats: quickStatsData,
            recentActivity: activityData?.items ?? [],
            // A timeout/throw leaves `activityData` null; that is a failure, not
            // a permission denial, so the card falls back to its empty state
            // rather than claiming the viewer's role is at fault.
            recentActivityUnavailable: activityData?.permissionDenied ?? false,
            monthlyTrends: trendsData || [],
            actionMetrics: actionMetricsData,
            lastUpdated: now.toISOString()
        },
        error: null
    };
}

/**
 * Helper to wrap a promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout: ${label} took longer than ${timeoutMs}ms`)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } catch (err) {
        console.error(`[withTimeout] ${label} failed or timed out:`, err);
        return fallback;
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

type PaymentMetrics = {
    collected_count: number;
    collected_total: number;
    verified_total: number;
};

const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Paid-payment aggregates for an inclusive date window via get_dashboard_payment_metrics
 * (SECURITY INVOKER, so RLS applies as the caller). Throws on any error or empty result: callers
 * must never render partial numbers.
 */
async function fetchPaymentMetrics(supabase: SupabaseClient, start: Date, end: Date): Promise<PaymentMetrics> {
    const { data, error } = await supabase.rpc('get_dashboard_payment_metrics', {
        p_month_start: localDate(start),
        p_month_end: localDate(end),
    });
    if (error) throw error;
    if (!data) throw new Error('get_dashboard_payment_metrics returned no data');
    return {
        collected_count: Number(data.collected_count) || 0,
        collected_total: Number(data.collected_total) || 0,
        verified_total: Number(data.verified_total) || 0,
    };
}

type FinancialTotals = {
    invoiceTotalDue: number;
    invoiceTotalPaid: number;
    overdueAmount: number;
    overdueCount: number;
    walletBalance: number;
    bankNet: number;
    pettyCashBalance: number;
    levyCount: number;
    levyTotalDue: number;
    levyTotalPaid: number;
    levyHousesPending: number;
};

/**
 * Invoice, overdue, wallet, bank, petty cash and development levy totals via
 * get_dashboard_financial_totals (SECURITY INVOKER, so RLS applies as the caller). One small read
 * whatever the table sizes, so the PostgREST 1000-row cap cannot truncate the sums (#775).
 * Throws on any error or empty result: callers must never render partial numbers.
 */
async function fetchFinancialTotals(supabase: SupabaseClient): Promise<FinancialTotals> {
    // Same UTC date string the old .lt('due_date', ...) used, so the overdue boundary does not move.
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.rpc('get_dashboard_financial_totals', { p_today: today });
    if (error) throw error;
    if (!data) throw new Error('get_dashboard_financial_totals returned no data');
    return {
        invoiceTotalDue: Number(data.invoice_total_due) || 0,
        invoiceTotalPaid: Number(data.invoice_total_paid) || 0,
        overdueAmount: Number(data.overdue_amount) || 0,
        overdueCount: Number(data.overdue_count) || 0,
        walletBalance: Number(data.wallet_balance) || 0,
        bankNet: Number(data.bank_net) || 0,
        pettyCashBalance: Number(data.petty_cash_balance) || 0,
        levyCount: Number(data.levy_count) || 0,
        levyTotalDue: Number(data.levy_total_due) || 0,
        levyTotalPaid: Number(data.levy_total_paid) || 0,
        levyHousesPending: Number(data.levy_houses_pending) || 0,
    };
}

async function fetchFinancialHealth(
    supabase: SupabaseClient,
    financialTotals: Promise<FinancialTotals>,
    monthStart: Date,
    monthEnd: Date,
    prevMonthStart: Date,
    prevMonthEnd: Date
): Promise<FinancialHealthMetrics> {
    // Payment totals come from one server-side aggregate per month (no row download, so the
    // PostgREST 1000-row cap cannot truncate them). A row counts as verified when is_verified OR
    // it came from a statement/email import.
    const [totals, currentMetrics, prevMetrics] = await Promise.all([
        financialTotals,
        fetchPaymentMetrics(supabase, monthStart, monthEnd),
        fetchPaymentMetrics(supabase, prevMonthStart, prevMonthEnd),
    ]);

    const totalDue = totals.invoiceTotalDue;
    const totalCollected = totals.invoiceTotalPaid;
    const totalOutstanding = totalDue - totalCollected;

    const totalMonthlyRevenue = currentMetrics.collected_total;
    const monthlyRevenue = currentMetrics.verified_total;
    const previousMonthRevenue = prevMetrics.verified_total;

    const revenueChange = previousMonthRevenue > 0
        ? ((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
        : monthlyRevenue > 0 ? 100 : 0;

    const walletCredits = totals.walletBalance;
    // Portfolio Value: bank balance (completed statement rows, credits - debits) + petty cash
    const bankBalance = totals.bankNet;
    const pettyCashBalance = totals.pettyCashBalance;
    const estateCash = bankBalance + pettyCashBalance;

    const collectionRate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;

    return {
        totalOutstanding,
        totalCollected,
        collectionRate,
        monthlyRevenue,
        totalMonthlyRevenue,
        previousMonthRevenue,
        revenueChange,
        totalWalletBalance: walletCredits,
        portfolioValue: estateCash,
        importedBankNetCash: bankBalance,
        pettyCashBalance,
        estateCash,
        walletCredits,
        overdueAmount: totals.overdueAmount,
        overdueCount: totals.overdueCount
    };
}

async function fetchInvoiceDistribution(supabase: SupabaseClient): Promise<InvoiceStatusDistribution> {
    // One RPC (get_dashboard_invoice_status_counts, SECURITY INVOKER so RLS applies as the caller)
    // returns the six raw counts the old head-count queries produced; the netting below is
    // unchanged.
    //
    // `overdue` is not its own status column value — it is derived as
    // (unpaid OR partially_paid) AND due_date < today. That makes it a
    // subset of the `unpaid` / `partially_paid` buckets, not a sibling of
    // them. To keep the five returned buckets a genuine partition of the
    // invoice table (no invoice counted twice), the overdue subset is
    // counted PER STATUS and each slice is subtracted out of its own
    // bucket below, rather than lumping both statuses into one overdue
    // count and subtracting it from just one bucket.
    //
    // `today` is deliberately the same UTC date string the previous implementation computed
    // (toISOString), not the DB CURRENT_DATE, so the overdue boundary does not move.
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.rpc('get_dashboard_invoice_status_counts', { p_today: today });
    if (error) throw error;
    if (!data) throw new Error('get_dashboard_invoice_status_counts returned no data');

    const unpaid = Number(data.unpaid) || 0;
    const paid = Number(data.paid) || 0;
    const partiallyPaid = Number(data.partially_paid) || 0;
    const voided = Number(data.void) || 0;
    const overdueUnpaidCount = Number(data.overdue_unpaid) || 0;
    const overduePartiallyPaidCount = Number(data.overdue_partially_paid) || 0;

    // Net each bucket down to its non-overdue remainder so the five
    // buckets returned here sum to the true invoice total instead of
    // double-counting the overdue subset.
    return {
        unpaid: Math.max(0, unpaid - overdueUnpaidCount),
        paid,
        partiallyPaid: Math.max(0, partiallyPaid - overduePartiallyPaidCount),
        overdue: overdueUnpaidCount + overduePartiallyPaidCount,
        void: voided
    };
}

async function fetchSecurityAlerts(
    supabase: SupabaseClient,
    now: Date,
    sevenDaysFromNow: Date
): Promise<SecurityAlerts> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const nowStr = now.toISOString();
    const sevenDaysFromNowStr = sevenDaysFromNow.toISOString();

    // Parallelize all 4 queries (4x faster)
    // We now use unique contact counts to match the Security module logic
    const [
        expiringCodesResult,
        expiredContactsResult,
        suspendedContactsResult,
        recentFlaggedResult,
    ] = await Promise.all([
        // Expiring codes list (top 5 contacts with codes expiring soon)
        // We select the contacts who have codes expiring
        supabase
            .from('security_contacts')
            .select(`
                id,
                full_name,
                resident:residents(first_name, last_name),
                access_codes!inner(id, code, valid_until)
            `)
            .eq('status', 'active')
            .eq('access_codes.is_active', true)
            .not('access_codes.valid_until', 'is', null)
            .gt('access_codes.valid_until', nowStr)
            .lte('access_codes.valid_until', sevenDaysFromNowStr)
            .limit(5),

        // Count contacts whose status is 'active' but have NO valid codes
        // (Either no codes at all, or all codes are inactive/expired)
        supabase
            .from('security_contacts')
            .select(`
                id,
                access_codes(id, is_active, valid_until)
            `)
            .eq('status', 'active'),

        // Suspended contacts
        supabase
            .from('security_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'suspended'),

        // Recent flagged entries (last 7 days)
        supabase
            .from('access_logs')
            .select('*', { count: 'exact', head: true })
            .eq('flagged', true)
            .gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    // Calculate Expired Contacts Count
    const allActiveContacts = expiredContactsResult.data || [];
    let expiredContactsCount = 0;
    for (const contact of allActiveContacts) {
        const codes = contact.access_codes || [];
        const hasValidCode = codes.some((code) => {
            if (!code.is_active) return false;
            if (!code.valid_until) return true; // No expiry = always valid
            return new Date(code.valid_until) > now;
        });

        if (!hasValidCode) {
            expiredContactsCount++;
        }
    }

    // Calculate Expiring Contacts Count (Unique contacts with at least one expiring code)
    // We fetch a bit more for formatting, but we need the count of distinct contacts
    const { count: expiringContactsCount } = await supabase
        .from('security_contacts')
        .select('id, access_codes!inner(id)', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('access_codes.is_active', true)
        .not('access_codes.valid_until', 'is', null)
        .gt('access_codes.valid_until', nowStr)
        .lte('access_codes.valid_until', sevenDaysFromNowStr);

    const formattedExpiringCodes = (expiringCodesResult.data ?? []).map((contact) => {
        // Find the best code to show (one that's expiring soonest but not yet expired)
        const code = contact.access_codes[0];
        return {
            id: contact.id,
            code: code.code,
            contactName: contact.full_name || 'Unknown',
            residentName: Array.isArray(contact.resident) && contact.resident[0]
                ? `${contact.resident[0].first_name} ${contact.resident[0].last_name}`
                : 'Unknown',
            validUntil: code.valid_until
        };
    });

    return {
        expiringCodesCount: expiringContactsCount ?? 0,
        expiredCodesCount: expiredContactsCount,
        suspendedContactsCount: suspendedContactsResult.count ?? 0,
        recentFlaggedEntries: recentFlaggedResult.count ?? 0,
        expiringCodes: formattedExpiringCodes
    };
}

async function fetchDevelopmentLevyStatus(financialTotals: Promise<FinancialTotals>): Promise<DevelopmentLevyStatus> {
    // Non-void invoices on development-levy billing profiles, aggregated server-side (#775).
    const totals = await financialTotals;
    return {
        totalLeviesGenerated: totals.levyCount,
        totalLevyAmount: totals.levyTotalDue,
        paidLevyAmount: totals.levyTotalPaid,
        pendingLevyAmount: totals.levyTotalDue - totals.levyTotalPaid,
        housesWithPendingLevy: totals.levyHousesPending
    };
}

async function fetchQuickStats(supabase: SupabaseClient): Promise<QuickStats> {
    const [
        { count: totalHouses },
        { count: occupiedHouses },
        { count: totalResidents },
        { count: activeResidents },
        { count: pendingVerification },
        { count: totalSecurityContacts },
        { data: contactsWithValidCodes }
    ] = await Promise.all([
        supabase.from('houses').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('houses').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_occupied', true),
        supabase.from('residents').select('id', { count: 'exact', head: true }),
        supabase.from('residents').select('id', { count: 'exact', head: true }).eq('account_status', 'active'),
        supabase.from('residents').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('security_contacts').select('id', { count: 'exact', head: true }),
        // Fix: Count contacts with at least one valid (non-expired) access code
        supabase
            .from('security_contacts')
            .select('id, access_codes!inner(id, is_active, valid_until)')
            .eq('status', 'active')
            .eq('access_codes.is_active', true)
            .or('valid_until.is.null,valid_until.gt.now()', { referencedTable: 'access_codes' })
    ]);

    // Count unique contacts with valid codes (a contact may have multiple valid codes)
    const activeSecurityContacts = new Set(contactsWithValidCodes?.map((c: { id: string }) => c.id) || []).size;

    return {
        totalHouses: totalHouses ?? 0,
        occupiedHouses: occupiedHouses ?? 0,
        vacantHouses: (totalHouses ?? 0) - (occupiedHouses ?? 0),
        totalResidents: totalResidents ?? 0,
        activeResidents: activeResidents ?? 0,
        pendingVerification: pendingVerification ?? 0,
        totalSecurityContacts: totalSecurityContacts ?? 0,
        activeSecurityContacts: activeSecurityContacts
    };
}

async function fetchRecentActivity(supabase: SupabaseClient, permissions: string[]): Promise<RecentActivityResult> {
    // #197: check the permission the `audit_logs` RLS SELECT policy enforces
    // *before* querying. Without this the denial arrives as zero rows and is
    // indistinguishable from a quiet estate, so the card renders "No recent
    // activity" at six of the eight roles. The caller resolves `permissions`
    // once per load (#775).
    if (!permissions.includes(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS)) {
        return { items: [], permissionDenied: true };
    }

    // Get from audit logs (most comprehensive)
    const { data: auditLogs, error } = await supabase
        .from('audit_logs')
        .select(`
            id,
            action,
            entity_type,
            entity_display,
            description,
            created_at,
            new_values,
            actor:profiles(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        // The permission check above already covers the expected RLS denial, so
        // anything landing here is a real query failure worth the log line.
        console.error('[fetchRecentActivity] audit_logs query failed:', error);
    }

    const auditLogRows: AuditLogEntry[] = (auditLogs || []) as unknown as AuditLogEntry[];
    return {
        items: auditLogRows.slice(0, 8).map((log) => formatAuditLog(log)),
        permissionDenied: false,
    };
}

async function fetchMonthlyTrends(supabase: SupabaseClient, now: Date): Promise<MonthlyTrend[]> {
    // Pre-generate all 6 month ranges
    const monthRanges = Array.from({ length: 6 }, (_, i) => {
        const monthIndex = 5 - i; // Reversed so oldest first
        const monthStart = new Date(now.getFullYear(), now.getMonth() - monthIndex, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthIndex + 1, 0, 23, 59, 59);
        const monthName = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { monthStart, monthEnd, monthName };
    });

    // Payment metrics: one RPC per month (6). Invoice counts: ONE RPC for all six windows
    // (get_dashboard_monthly_invoice_counts), so invoicesGenerated no longer costs 6 more queries.
    const [paymentMetrics, invoiceCounts] = await Promise.all([
        Promise.all(monthRanges.map(({ monthStart, monthEnd }) => fetchPaymentMetrics(supabase, monthStart, monthEnd))),
        fetchMonthlyInvoiceCounts(supabase, monthRanges),
    ]);

    return monthRanges.map(({ monthName }, i) => ({
        month: monthName,
        revenue: paymentMetrics[i].collected_total,
        invoicesGenerated: invoiceCounts[i],
        paymentsReceived: paymentMetrics[i].collected_count,
    }));
}

/**
 * Invoices created per month window (inclusive bounds, as the old per-month count used) in one
 * RPC. Returns one count per window in input order, zero for months with no rows or missing from
 * the result. Throws on RPC error so callers never render partial numbers.
 */
async function fetchMonthlyInvoiceCounts(
    supabase: SupabaseClient,
    ranges: Array<{ monthStart: Date; monthEnd: Date }>
): Promise<number[]> {
    const { data, error } = await supabase.rpc('get_dashboard_monthly_invoice_counts', {
        p_month_starts: ranges.map((r) => r.monthStart.toISOString()),
        p_month_ends: ranges.map((r) => r.monthEnd.toISOString()),
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('get_dashboard_monthly_invoice_counts returned no data');
    const counts = ranges.map(() => 0);
    for (const row of data as Array<{ idx: number; count: number }>) {
        const i = Number(row.idx) - 1;
        if (i >= 0 && i < counts.length) counts[i] = Number(row.count) || 0;
    }
    return counts;
}

// ─────────────────────────────────────────────────────────────────
// Individual card endpoints — each card fetches independently
// so Suspense boundaries actually stream rather than block
// ─────────────────────────────────────────────────────────────────

async function requireAuthClient() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    return supabase;
}

export async function getDashboardFinancialHealth(): Promise<{ data: FinancialHealthMetrics | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const data = await fetchFinancialHealth(
            supabase, fetchFinancialTotals(supabase), monthStart, monthEnd, prevMonthStart, prevMonthEnd
        );
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch financial health' };
    }
}

export async function getDashboardInvoiceDistribution(): Promise<{ data: InvoiceStatusDistribution | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const data = await fetchInvoiceDistribution(supabase);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch invoice distribution' };
    }
}

export async function getDashboardSecurityAlerts(): Promise<{ data: SecurityAlerts | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const data = await fetchSecurityAlerts(supabase, now, sevenDaysFromNow);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch security alerts' };
    }
}

async function fetchActionMetrics(
    supabase: SupabaseClient,
    now: Date,
    sevenDaysFromNow: Date
): Promise<DashboardActionMetrics> {
    const [pendingResidents, unverifiedPayments, expiringContacts] = await Promise.all([
        supabase.from('residents').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('payment_records').select('id', { count: 'exact', head: true }).eq('is_verified', false).eq('status', 'paid'),
        supabase
            .from('security_contacts')
            .select('id, access_codes!inner(id)', { count: 'exact', head: true })
            .eq('status', 'active')
            .eq('access_codes.is_active', true)
            .not('access_codes.valid_until', 'is', null)
            .gt('access_codes.valid_until', now.toISOString())
            .lte('access_codes.valid_until', sevenDaysFromNow.toISOString()),
    ]);
    const error = pendingResidents.error || unverifiedPayments.error || expiringContacts.error;
    if (error) throw error;

    const pendingResidentVerifications = pendingResidents.count ?? 0;
    const unverifiedPaymentCount = unverifiedPayments.count ?? 0;
    const expiringSecurityContacts = expiringContacts.count ?? 0;

    return {
        pendingResidentVerifications,
        unverifiedPayments: unverifiedPaymentCount,
        expiringSecurityContacts,
        totalRequiringAttention: pendingResidentVerifications + unverifiedPaymentCount + expiringSecurityContacts,
    };
}

export async function getDashboardActionMetrics(): Promise<{ data: DashboardActionMetrics | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const data = await fetchActionMetrics(supabase, now, sevenDaysFromNow);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch dashboard actions' };
    }
}

export async function getDashboardQuickStats(): Promise<{ data: QuickStats | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const data = await fetchQuickStats(supabase);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch quick stats' };
    }
}

export async function getDashboardRecentActivity(): Promise<{ data: RecentActivityResult | null; error: string | null }> {
    try {
        const supabase = await requireAuthClient();
        const { permissions } = await getCurrentUserPermissions();
        const data = await fetchRecentActivity(supabase, permissions);
        return { data, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err.message : 'Failed to fetch recent activity' };
    }
}

