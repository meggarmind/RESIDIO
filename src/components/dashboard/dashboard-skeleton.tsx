import { Skeleton } from '@/components/ui/skeleton';

interface DashboardSkeletonProps {
    label?: string;
    state?: 'route' | 'auth';
}

export function DashboardSkeleton({
    label = 'Loading dashboard',
    state = 'route',
}: DashboardSkeletonProps) {
    return (
        <div className="space-y-6" role="status" aria-label={label} data-loading-state={state}>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Skeleton className="h-8 w-64 rounded-lg" />
                    <Skeleton className="h-5 w-56 rounded-md" />
                </div>
                {[1, 2, 3].map((i) => (
                    <div key={i} className="col-span-12 space-y-4 rounded-xl border bg-card p-5 shadow-sm lg:col-span-4">
                        <Skeleton className="h-10 w-48 rounded-lg" />
                        <Skeleton className="h-9 w-40 rounded-lg" />
                        <Skeleton className="h-12 w-full rounded-md" />
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                ))}
                <div className="col-span-12 space-y-2 rounded-xl border bg-card p-5">
                    <Skeleton className="h-6 w-40 rounded-lg" />
                    <Skeleton className="h-5 w-full rounded-md" />
                    <Skeleton className="h-5 w-3/4 rounded-md" />
                </div>
            </div>
        </div>
    );
}
