import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="animate-slide-up">
                <Skeleton className="h-9 w-64 rounded-lg" />
                <Skeleton className="h-5 w-80 mt-2 rounded-md" />
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={`rounded-2xl border bg-card p-6 shadow-soft animate-slide-up stagger-${i}`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <Skeleton className="h-4 w-24 rounded-md" />
                            <Skeleton className="h-11 w-11 rounded-xl" />
                        </div>
                        <Skeleton className="h-9 w-20 rounded-lg mb-2" />
                        <Skeleton className="h-3 w-32 rounded-md" />
                    </div>
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-4">
                <div className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <Skeleton className="h-[200px] w-full rounded-xl" />
                </div>
                <div className="lg:col-span-1 rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <Skeleton className="h-[200px] w-full rounded-xl" />
                </div>
                <div className="lg:col-span-1 rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <Skeleton className="h-[200px] w-full rounded-xl" />
                </div>
            </div>

            {/* Bottom Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
