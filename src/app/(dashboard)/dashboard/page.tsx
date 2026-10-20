import { Suspense } from 'react';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY } from '@/hooks/dashboard-query-keys';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { DashboardContent } from '@/app/(dashboard)/dashboard/dashboard-content';

const unwrap = async <T,>(read: Promise<{ data: T | null; error: string | null }>) => {
    const result = await read;
    if (result.error) throw new Error(result.error);
    return result.data;
};

// Prefetch the snapshot so the strip and lanes render on first paint (#782). The map is left to the
// client cache: it is one object per house and has its own staleTime. A failed read is left out of
// the dehydrated state and the client fetches it as before.
export default async function DashboardPage() {
    const queryClient = new QueryClient();
    await queryClient.prefetchQuery({ queryKey: ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY, queryFn: () => unwrap(getAdminDashboardSnapshot()) });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Suspense fallback={<DashboardSkeleton label="Loading dashboard navigation" state="route" />}>
                <DashboardContent />
            </Suspense>
        </HydrationBoundary>
    );
}
