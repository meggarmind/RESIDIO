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
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Parallel fetch all data
        const [
            financialData,
            invoiceDistribution,
            securityData,
            levyData,
            quickStatsData,
            activityData,
            trendsData
        ] = await Promise.all([
            fetchFinancialHealth(supabase, monthStart, monthEnd, prevMonthStart, prevMonthEnd),
            fetchInvoiceDistribution(supabase),
            fetchSecurityAlerts(supabase, now, sevenDaysFromNow),
            fetchDevelopmentLevyStatus(supabase),
            fetchQuickStats(supabase),
            fetchRecentActivity(supabase),
            fetchMonthlyTrends(supabase, now)
        ]);

        return {
            data: {
                financialHealth: financialData,
                invoiceDistribution,
                securityAlerts: securityData,
                developmentLevy: levyData,
                quickStats: quickStatsData,
                recentActivity: activityData,
                monthlyTrends: trendsData,
                lastUpdated: now.toISOString()
            },
            error: null
        };
    } catch (err) {
        console.error('Enhanced dashboard stats error:', err);
        return { data: null, error: 'Failed to fetch dashboard stats' };
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
        .in('status', ['unpaid', 'partially_paid', 'overdue'])
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
    const { data: invoices } = await supabase
        .from('invoices')
        .select('status');

    const distribution: InvoiceStatusDistribution = {
        unpaid: 0,
        paid: 0,
        partiallyPaid: 0,
        overdue: 0,
        void: 0
    };

    invoices?.forEach((inv: { status: string }) => {
        switch (inv.status) {
            case 'unpaid': distribution.unpaid++; break;
            case 'paid': distribution.paid++; break;
            case 'partially_paid': distribution.partiallyPaid++; break;
            case 'overdue': distribution.overdue++; break;
            case 'void': distribution.void++; break;
        }
    });

    return distribution;
}

async function fetchSecurityAlerts(
    supabase: any,
    now: Date,
    sevenDaysFromNow: Date
): Promise<SecurityAlerts> {
    // Expiring codes (within 7 days)
    const { data: expiringCodes } = await supabase
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
        .limit(5);

    // Expired codes count
    const { count: expiredCodesCount } = await supabase
        .from('access_codes')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .not('valid_until', 'is', null)
        .lt('valid_until', now.toISOString());

    // Suspended contacts
    const { count: suspendedContactsCount } = await supabase
        .from('security_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'suspended');

    // Recent flagged entries (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { count: recentFlaggedEntries } = await supabase
        .from('access_logs')
        .select('*', { count: 'exact', head: true })
        .eq('flagged', true)
        .gte('created_at', sevenDaysAgo.toISOString());

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
        supabase.from('houses').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('houses').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_occupied', true),
        supabase.from('residents').select('*', { count: 'exact', head: true }),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('account_status', 'active'),
        supabase.from('residents').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
        supabase.from('security_contacts').select('*', { count: 'exact', head: true }),
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
    const trends: MonthlyTrend[] = [];

    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        const monthName = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        // Get payments for this month
        const { data: payments } = await supabase
            .from('payment_records')
            .select('amount')
            .gte('payment_date', monthStart.toISOString())
            .lte('payment_date', monthEnd.toISOString())
            .eq('status', 'paid');

        const revenue = payments?.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0) ?? 0;

        // Get invoices generated this month
        const { count: invoicesGenerated } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString())
            .lte('created_at', monthEnd.toISOString());

        trends.push({
            month: monthName,
            revenue,
            invoicesGenerated: invoicesGenerated ?? 0,
            paymentsReceived: payments?.length ?? 0
        });
    }

    return trends;
}
