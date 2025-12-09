'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface DashboardStats {
    totalResidents: number;
    activeResidents: number;
    paymentsThisMonth: number;
    paymentsThisMonthAmount: number;
    totalInvoices: number;
    paidInvoices: number;
    paymentRate: number; // percentage
    recentActivity: RecentActivityItem[];
}

export interface RecentActivityItem {
    id: string;
    type: 'payment' | 'resident' | 'invoice';
    description: string;
    timestamp: string;
    actorName?: string;
}

export async function getDashboardStats(): Promise<{ data: DashboardStats | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    try {
        // Get current month boundaries
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        // 1. Get resident counts
        const { count: totalResidents, error: resError } = await supabase
            .from('residents')
            .select('*', { count: 'exact', head: true });

        const { count: activeResidents, error: activeError } = await supabase
            .from('residents')
            .select('*', { count: 'exact', head: true })
            .eq('account_status', 'active');

        if (resError || activeError) {
            console.error('Error fetching resident counts:', resError || activeError);
        }

        // 2. Get payments this month
        const { data: paymentsData, error: payError } = await supabase
            .from('payment_records')
            .select('amount')
            .gte('payment_date', monthStart)
            .lte('payment_date', monthEnd)
            .eq('status', 'paid');

        if (payError) {
            console.error('Error fetching payments:', payError);
        }

        const paymentsThisMonth = paymentsData?.length ?? 0;
        const paymentsThisMonthAmount = paymentsData?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;

        // 3. Calculate payment rate from invoices
        const { count: totalInvoices, error: invError } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .neq('status', 'void');

        const { count: paidInvoices, error: paidError } = await supabase
            .from('invoices')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'paid');

        if (invError || paidError) {
            console.error('Error fetching invoice counts:', invError || paidError);
            // Continue with default values instead of failing
        }

        const paymentRate = totalInvoices && totalInvoices > 0
            ? Math.round(((paidInvoices ?? 0) / totalInvoices) * 100)
            : 0;

        // 4. Get recent activity (last 5 items from payments and residents)
        const recentActivity: RecentActivityItem[] = [];

        // Recent payments
        const { data: recentPayments, error: recentPayError } = await supabase
            .from('payment_records')
            .select(`
                id,
                amount,
                payment_date,
                resident:residents(first_name, last_name)
            `)
            .order('payment_date', { ascending: false })
            .limit(3);

        if (recentPayError) {
            console.error('Error fetching recent payments:', recentPayError);
        }

        recentPayments?.forEach((p: any) => {
            recentActivity.push({
                id: p.id,
                type: 'payment',
                description: `Payment of ₦${Number(p.amount).toLocaleString()} recorded`,
                timestamp: p.payment_date,
                actorName: p.resident ? `${p.resident.first_name} ${p.resident.last_name}` : undefined
            });
        });

        // Recent residents
        const { data: recentResidents, error: recentResError } = await supabase
            .from('residents')
            .select('id, first_name, last_name, created_at')
            .order('created_at', { ascending: false })
            .limit(2);

        if (recentResError) {
            console.error('Error fetching recent residents:', recentResError);
        }

        recentResidents?.forEach((r: any) => {
            recentActivity.push({
                id: r.id,
                type: 'resident',
                description: `New resident registered`,
                timestamp: r.created_at,
                actorName: `${r.first_name} ${r.last_name}`
            });
        });

        // Sort by timestamp descending
        recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return {
            data: {
                totalResidents: totalResidents ?? 0,
                activeResidents: activeResidents ?? 0,
                paymentsThisMonth,
                paymentsThisMonthAmount,
                totalInvoices: totalInvoices ?? 0,
                paidInvoices: paidInvoices ?? 0,
                paymentRate,
                recentActivity: recentActivity.slice(0, 5)
            },
            error: null
        };
    } catch (err) {
        console.error('Dashboard stats error:', err);
        return { data: null, error: 'Failed to fetch dashboard stats' };
    }
}
