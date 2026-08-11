import { Skeleton } from '@/components/ui/skeleton';

export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div>
            <Skeleton className="mb-1 h-7 w-36" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-xl border shadow-sm">
        <div className="border-b px-5 py-4">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="p-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-36 rounded-md" />
            <Skeleton className="h-10 w-36 rounded-md" />
          </div>
          {/* Table rows */}
          <div className="mt-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-64 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
