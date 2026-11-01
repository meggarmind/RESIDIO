import { Suspense } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { REPORT_VIEW_PERMISSIONS, reportsForPermissions } from '@/lib/validators/reports';
import { ReportsPageClient } from '@/components/reports/reports-page-client';

export const metadata: Metadata = {
    title: 'Generate reports',
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

    // Open to a user who may run at least one listed report; the picker shows only those (#1397).
    const auth = await authorizeAnyPermission(REPORT_VIEW_PERMISSIONS);
    if (!auth.authorized) {
        redirect('/dashboard');
    }
    const allowedReportTypes = reportsForPermissions(auth.permissions);

    // The client reads ?tab= with useSearchParams, which needs a Suspense boundary for the build.
    return (
        <Suspense fallback={null}>
            <ReportsPageClient allowedReportTypes={allowedReportTypes} />
        </Suspense>
    );
}
