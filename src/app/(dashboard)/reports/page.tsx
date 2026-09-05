import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
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

    // Permission check (migrated off the legacy role-list check)
    const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    if (!auth.authorized) {
        redirect('/dashboard');
    }

    return <ReportsPageClient />;
}
