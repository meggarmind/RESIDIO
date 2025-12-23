import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ReportsPageClient } from '@/components/reports/reports-page-client';

export const metadata: Metadata = {
    title: 'Financial Reports',
    description: 'Generate and view financial reports',
};

export default async function ReportsPage() {
    const supabase = await createServerSupabaseClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    // RBAC Check - Only admin, chairman, and financial_secretary can view reports
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
    if (!profile || !allowedRoles.includes(profile.role)) {
        redirect('/dashboard');
    }

    return <ReportsPageClient />;
}
