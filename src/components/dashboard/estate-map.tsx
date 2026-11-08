'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatAsOf } from '@/components/dashboard/command-lane';
import { HouseTileGrid, HOUSE_TILE_GRID } from '@/components/houses/house-tile-grid';
import { PAYMENT_STATUS_META } from '@/components/houses/house-status-maps';
import type { EstateMapSnapshot, EstateMapStatus } from '@/types/estate-map';

/** Kept so existing imports keep working; the map now lives in house-status-maps. */
export const STATUS_META = PAYMENT_STATUS_META;

const FILTERS: EstateMapStatus[] = ['overdue', 'outstanding', 'paid_up', 'no_invoice'];

interface EstateMapProps {
  snapshot: EstateMapSnapshot | null;
  isLoading: boolean;
  /** Error message from the read. 'Unauthorized' means the viewer lacks billing view. */
  error: string | null;
}

// On the page background under a rule; only the lanes are bordered cards.
const shell = 'col-span-12 border-t pt-5';
const GRID = HOUSE_TILE_GRID;

export function EstateMap({ snapshot, isLoading, error }: EstateMapProps) {
  if (error === 'Unauthorized') {
    return (
      <section aria-label="Estate map" data-testid="estate-map-locked" className={shell}>
        <h2 className="text-base font-semibold">Estate map</h2>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>The estate map isn&apos;t available for your role. Viewing it needs the &ldquo;view billing&rdquo; permission.</span>
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section aria-label="Estate map" data-testid="estate-map-loading" className={shell}>
        <h2 className="text-base font-semibold">Estate map</h2>
        <div className={cn('mt-3', GRID)} aria-label="Loading estate map">
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (error || !snapshot) {
    return (
      <section aria-label="Estate map" data-testid="estate-map-unavailable" className={shell}>
        <h2 className="text-base font-semibold">Estate map</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The estate map could not be loaded, so house payment status is unknown. Try refreshing the page.
        </p>
      </section>
    );
  }

  if (snapshot.houses.length === 0) {
    return (
      <section aria-label="Estate map" data-testid="estate-map-empty" className={shell}>
        <h2 className="text-base font-semibold">Estate map</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No houses yet.{' '}
          <Link href="/houses" className="font-medium text-foreground underline">
            Go to Houses
          </Link>
        </p>
      </section>
    );
  }

  const asOf = formatAsOf(snapshot.asOf);

  return (
    <section aria-label="Estate map" data-testid="estate-map" className={shell}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">Estate map</h2>
        {asOf ? <span className="text-xs text-muted-foreground">Map as of {asOf}</span> : null}
      </header>

      <HouseTileGrid
        houses={snapshot.houses}
        statusMeta={STATUS_META}
        filterOrder={FILTERS}
        counts={snapshot.counts}
        testIdPrefix="estate-map"
      />
    </section>
  );
}
