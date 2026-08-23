import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';

export default function DashboardLoading() {
    return <DashboardSkeleton label="Loading dashboard route" state="route" />;
}
