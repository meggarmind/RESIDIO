import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the house detail layout: header with status line, tab strip, resident rows.
export default function HouseDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading house">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="size-11 rounded-md md:size-9" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
        <Skeleton className="h-11 w-28 rounded-md md:h-9" />
      </div>
      <Skeleton className="h-11 w-60 rounded-lg md:h-9" />
      <div className="rounded-xl border p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
