import { Skeleton } from '@/components/ui/skeleton';

function RegistryPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div>
            <Skeleton className="mb-1 h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      {/* KPI strip skeleton */}
      <div className="grid overflow-hidden rounded-xl border sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-1 h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border shadow-sm">
        <div className="space-y-3 p-4">
          <Skeleton className="h-10 w-full rounded-md" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ResidentsLoading() {
  return <RegistryPageSkeleton />;
}
