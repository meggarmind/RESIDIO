'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────
// Enhanced Dashboard Stats Types
// ─────────────────────────────────────────────────────────────────

export interface FinancialHealthMetrics {
    totalOutstanding: number;
    totalCollected: number;
    collectionRate: number;
    monthlyRevenue: number;
    previousMonthRevenue: number;
    revenueChange: number; // percentage change
    totalWalletBalance: number;
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

export interface MonthlyTrend {
    month: string;
    revenue: number;
    invoicesGenerated: number;
    paymentsReceived: number;
}

export interface EnhancedDashboardStats {
    financialHealth: FinancialHealthMetrics;
    invoiceDistribution: InvoiceStatusDistribution;
    securityAlerts: SecurityAlerts;
    developmentLevy: DevelopmentLevyStatus;
    quickStats: QuickStats;
    recentActivity: RecentActivityItem[];
    monthlyTrends: MonthlyTrend[];
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
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            console.error('[getEnhancedDashboardStats] No active session');
            return { data: null, error: 'Unauthorized' };
        }

        console.log(`[getEnhancedDashboardStats] Fetching stats for user: ${user.id}`);

        // Overall Action Timeout (15 seconds)
        const totalTimeoutPromise = new Promise<{ data: EnhancedDashboardStats | null; error: string | null }>((_, reject) => {
            setTimeout(() => reject(new Error('Total action timeout: getEnhancedDashboardStats took longer than 15s')), 15000);
        });

        return await Promise.race([
            getStatsWithTimeout(supabase),
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

async function getStatsWithTimeout(supabase: any): Promise<{ data: EnhancedDashboardStats | null; error: string | null }> {
    console.log('[getEnhancedDashboardStats] Starting data fetch sequence...');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Parallel fetch all data with individual timeouts to prevent hanging
    const TIMEOUT = 10000; // 10 seconds per sub-query

    console.log('[getEnhancedDashboardStats] Executing sub-queries in parallel...');
    const [
        financialData,
        invoiceDistribution,
        securityData,
        levyData,
        quickStatsData,
        activityData,
        trendsData
    ] = await Promise.all([
        withTimeout(
            fetchFinancialHealth(supabase, monthStart, monthEnd, prevMonthStart, prevMonthEnd),
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
            fetchDevelopmentLevyStatus(supabase),
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
            fetchRecentActivity(supabase),
            TIMEOUT,
            null,
            'fetchRecentActivity'
        ),
        withTimeout(
            fetchMonthlyTrends(supabase, now),
            TIMEOUT,
            [],
            'fetchMonthlyTrends'
        )
    ]);

    console.log('[getEnhancedDashboardStats] Sub-queries complete. Aggregating results...');

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
            financialHealth: financialData || {
                totalOutstanding: 0, totalCollected: 0, collectionRate: 0,
                monthlyRevenue: 0, previousMonthRevenue: 0, revenueChange: 0,
                totalWalletBalance: 0, overdueAmount: 0, overdueCount: 0
            },
            invoiceDistribution: invoiceDistribution || {
                unpaid: 0, paid: 0, partiallyPaid: 0, overdue: 0, void: 0
            },
            securityAlerts: securityData || {
                expiringCodesCount: 0, expiredCodesCount: 0, suspendedContactsCount: 0,
                recentFlaggedEntries: 0, expiringCodes: []
            },
            developmentLevy: levyData || {
                totalLeviesGenerated: 0, totalLevyAmount: 0, paidLevyAmount: 0,
                pendingLevyAmount: 0, housesWithPendingLevy: 0
            },
            quickStats: quickStatsData || {
                totalHouses: 0, occupiedHouses: 0, vacantHouses: 0,
                totalResidents: 0, activeResidents: 0, pendingVerification: 0,
                totalSecurityContacts: 0, activeSecurityContacts: 0
            },
            recentActivity: activityData || [],
            monthlyTrends: trendsData || [],
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

async function fetchFinancialHealth(
    supabase: any,
    monthStart: Date,
    monthEnd: Date,
    prevMonthStart: Date,
    prevMonthEnd: Date
): Promise<FinancialHealthMetrics> {
    // Get invoice totals
    const { data: invoices } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid, status')
        .neq('status', 'void');

    const totalDue = invoices?.reduce((sum: number, i: any) => sum + (Number(i.amount_due) || 0), 0) ?? 0;
    const totalCollected = invoices?.reduce((sum: number, i: any) => sum + (Number(i.amount_paid) || 0), 0) ?? 0;
    const totalOutstanding = totalDue - totalCollected;

    // Get overdue invoices
    const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid')
        .in('status', ['unpaid', 'partially_paid'])
        .lt('due_date', new Date().toISOString().split('T')[0]);

    const overdueAmount = overdueInvoices?.reduce(
        (sum: number, i: any) => sum + ((Number(i.amount_due) || 0) - (Number(i.amount_paid) || 0)),
        0
    ) ?? 0;
    const overdueCount = overdueInvoices?.length ?? 0;

    // Current month payments
    const { data: currentPayments } = await supabase
        .from('payment_records')
        .select('amount')
        .gte('payment_date', monthStart.toISOString())
        .lte('payment_date', monthEnd.toISOString())
        .eq('status', 'paid');

    const monthlyRevenue = currentPayments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ?? 0;

    // Previous month payments
    const { data: prevPayments } = await supabase
        .from('payment_records')
        .select('amount')
        .gte('payment_date', prevMonthStart.toISOString())
        .lte('payment_date', prevMonthEnd.toISOString())
        .eq('status', 'paid');

    const previousMonthRevenue = prevPayments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ?? 0;
    const revenueChange = previousMonthRevenue > 0
        ? ((monthlyRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
        : monthlyRevenue > 0 ? 100 : 0;

    // Total wallet balance
    const { data: wallets } = await supabase
        .from('resident_wallets')
        .select('balance');

    const totalWalletBalance = wallets?.reduce((sum: number, w: any) => sum + (Number(w.balance) || 0), 0) ?? 0;

    const collectionRate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;

    return {
        totalOutstanding,
        totalCollected,
        collectionRate,
        monthlyRevenue,
        previousMonthRevenue,
        revenueChange,
        totalWalletBalance,
        overdueAmount,
        overdueCount
    };
}

async function fetchInvoiceDistribution(supabase: any): Promise<InvoiceStatusDistribution> {
    // Use parallel COUNT queries instead of fetching all invoices
    // This is ~100x faster for large invoice tables
    const [unpaid, paid, partiallyPaid, overdueData, voided] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'unpaid'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'partially_paid'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['unpaid', 'partially_paid']).lt('due_date', new Date().toISOString().split('T')[0]),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'void'),
    ]);

    return {
        unpaid: unpaid.count ?? 0,
        paid: paid.count ?? 0,
        partiallyPaid: partiallyPaid.count ?? 0,
        overdue: overdueData.count ?? 0,
        void: voided.count ?? 0
    };
}

async function fetchSecurityAlerts(
    supabase: any,
    now: Date,
    sevenDaysFromNow: Date
): Promise<SecurityAlerts> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Parallelize all 4 queries (4x faster)
    const [
        expiringCodesResult,
        expiredCodesResult,
        suspendedContactsResult,
        recentFlaggedResult,
    ] = await Promise.all([
        // Expiring codes (within 7 days)
        supabase
            .from('access_codes')
            .select(`
                id,
                code,
                valid_until,
                contact:security_contacts(
                    full_name,
                    resident:residents(first_name, last_name)
                )
            `)
            .eq('is_active', true)
            .not('valid_until', 'is', null)
            .gte('valid_until', now.toISOString())
            .lte('valid_until', sevenDaysFromNow.toISOString())
            .limit(5),
        // Expired codes count
        supabase
            .from('access_codes')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .not('valid_until', 'is', null)
            .lt('valid_until', now.toISOString()),
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

    const expiringCodes = expiringCodesResult.data;
    const expiredCodesCount = expiredCodesResult.count;
    const suspendedContactsCount = suspendedContactsResult.count;
    const recentFlaggedEntries = recentFlaggedResult.count;

    const formattedExpiringCodes = (expiringCodes ?? []).map((code: any) => ({
        id: code.id,
        code: code.code,
        contactName: code.contact?.full_name || 'Unknown',
        residentName: code.contact?.resident
            ? `${code.contact.resident.first_name} ${code.contact.resident.last_name}`
            : 'Unknown',
        validUntil: code.valid_until
    }));

    return {
        expiringCodesCount: expiringCodes?.length ?? 0,
        expiredCodesCount: expiredCodesCount ?? 0,
        suspendedContactsCount: suspendedContactsCount ?? 0,
        recentFlaggedEntries: recentFlaggedEntries ?? 0,
        expiringCodes: formattedExpiringCodes
    };
}

async function fetchDevelopmentLevyStatus(supabase: any): Promise<DevelopmentLevyStatus> {
    // Get development levy billing profiles
    const { data: levyProfiles } = await supabase
        .from('billing_profiles')
        .select('id')
        .eq('is_development_levy', true);

    const levyProfileIds = levyProfiles?.map((p: { id: string }) => p.id) ?? [];

    if (levyProfileIds.length === 0) {
        return {
            totalLeviesGenerated: 0,
            totalLevyAmount: 0,
            paidLevyAmount: 0,
            pendingLevyAmount: 0,
            housesWithPendingLevy: 0
        };
    }

    // Get levy invoices
    const { data: levyInvoices } = await supabase
        .from('invoices')
        .select('amount_due, amount_paid, status, house_id')
        .in('billing_profile_id', levyProfileIds)
        .neq('status', 'void');

    const totalLeviesGenerated = levyInvoices?.length ?? 0;
    const totalLevyAmount = levyInvoices?.reduce((sum: number, i: any) => sum + (Number(i.amount_due) || 0), 0) ?? 0;
    const paidLevyAmount = levyInvoices?.reduce((sum: number, i: any) => sum + (Number(i.amount_paid) || 0), 0) ?? 0;
    const pendingLevyAmount = totalLevyAmount - paidLevyAmount;

    // Count unique houses with pending levy
    const housesWithPendingLevy = new Set(
        levyInvoices
            ?.filter((i: any) => i.status !== 'paid' && (Number(i.amount_due) - Number(i.amount_paid)) > 0)
            .map((i: any) => i.house_id)
    ).size;

    return {
        totalLeviesGenerated,
        totalLevyAmount,
        paidLevyAmount,
        pendingLevyAmount,
        housesWithPendingLevy
    };
}

async function fetchQuickStats(supabase: any): Promise<QuickStats> {
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

async function fetchRecentActivity(supabase: any): Promise<RecentActivityItem[]> {
    const activity: RecentActivityItem[] = [];

    // Get from audit logs (most comprehensive)
    const { data: auditLogs } = await supabase
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

    auditLogs?.forEach((log: any) => {
        let type: RecentActivityItem['type'] = 'resident';
        let description = log.description || `${log.action} ${log.entity_type}`;

        switch (log.entity_type) {
            case 'payments':
                type = 'payment';
                break;
            case 'invoices':
                type = 'invoice';
                break;
            case 'security_contacts':
            case 'access_codes':
                type = 'security';
                break;
            case 'bank_statement_imports':
                type = 'import';
                break;
            case 'approval_requests':
                type = 'approval';
                break;
        }

        activity.push({
            id: log.id,
            type,
            action: log.action,
            description,
            timestamp: log.created_at,
            actorName: log.actor?.full_name || undefined,
            entityName: log.entity_display || undefined,
            amount: log.new_values?.amount ? Number(log.new_values.amount) : undefined
        });
    });

    return activity.slice(0, 8);
}

async function fetchMonthlyTrends(supabase: any, now: Date): Promise<MonthlyTrend[]> {
    // Pre-generate all 6 month ranges
    const monthRanges = Array.from({ length: 6 }, (_, i) => {
        const monthIndex = 5 - i; // Reversed so oldest first
        const monthStart = new Date(now.getFullYear(), now.getMonth() - monthIndex, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthIndex + 1, 0, 23, 59, 59);
        const monthName = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        return { monthStart, monthEnd, monthName };
    });

    // Fetch all months in parallel (12 queries → 1 round trip)
    // This is ~6x faster than sequential fetching
    const results = await Promise.all(
        monthRanges.map(async ({ monthStart, monthEnd, monthName }) => {
            // Run both queries for this month in parallel
            const [paymentsResult, invoicesResult] = await Promise.all([
                supabase
                    .from('payment_records')
                    .select('amount')
                    .gte('payment_date', monthStart.toISOString())
                    .lte('payment_date', monthEnd.toISOString())
                    .eq('status', 'paid'),
                supabase
                    .from('invoices')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', monthStart.toISOString())
                    .lte('created_at', monthEnd.toISOString()),
            ]);

            const payments = paymentsResult.data;
            const revenue = payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ?? 0;

            return {
                month: monthName,
                revenue,
                invoicesGenerated: invoicesResult.count ?? 0,
                paymentsReceived: payments?.length ?? 0,
            };
        })
    );

    return results;
}
