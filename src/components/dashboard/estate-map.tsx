'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatAsOf } from '@/components/dashboard/command-lane';
import { STATUS_COLORS, type StatusState } from '@/components/dashboard/status-colors';
import type { EstateMapHouse, EstateMapSnapshot, EstateMapStatus } from '@/types/estate-map';

type Filter = 'all' | EstateMapStatus;

type StatusMeta = { label: string; icon: React.ElementType | null; cell: string; cue: string };

const flagged = (label: string, icon: React.ElementType, state: StatusState): StatusMeta => ({
  label,
  icon,
  cell: cn('border-2 bg-card text-foreground', STATUS_COLORS[state].border),
  cue: STATUS_COLORS[state].text,
});
const plain = (label: string): StatusMeta => ({ label, icon: null, cell: 'bg-muted text-foreground', cue: '' });

/** Only exceptions are marked: a status-hue 2px border and icon. Paid up and No invoice are plain neutral cells (#782). */
export const STATUS_META: Record<EstateMapStatus, StatusMeta> = {
  overdue: flagged('Overdue', AlertTriangle, 'overdue'),
  outstanding: flagged('Outstanding', Clock, 'attention'),
  paid_up: plain('Paid up'),
  no_invoice: plain('No invoice'),
};

const FILTERS: Filter[] = ['all', 'overdue', 'outstanding', 'paid_up', 'no_invoice'];

interface EstateMapProps {
  snapshot: EstateMapSnapshot | null;
  isLoading: boolean;
  /** Error message from the read. 'Unauthorized' means the viewer lacks billing view. */
  error: string | null;
}

// On the page background under a rule; only the lanes are bordered cards.
const shell = 'col-span-12 border-t pt-5';
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2';

function groupByStreet(houses: EstateMapHouse[]): { name: string; houses: EstateMapHouse[] }[] {
  const groups = new Map<string, EstateMapHouse[]>();
  for (const h of houses) {
    const key = h.streetName ?? 'No street';
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }
  return Array.from(groups, ([name, list]) => ({ name, houses: list }));
}

/** The chips double as the legend, so a flagged status shows its cell icon. */
function ChipIcon({ status }: { status: EstateMapStatus }) {
  const { icon: Icon, cue } = STATUS_META[status];
  return Icon ? <Icon className={cn('h-3 w-3 shrink-0', cue)} aria-hidden="true" /> : null;
}

export function EstateMap({ snapshot, isLoading, error }: EstateMapProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const groups = useMemo(() => (snapshot ? groupByStreet(snapshot.houses) : []), [snapshot]);

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
  const total = snapshot.houses.length;

  return (
    <section aria-label="Estate map" data-testid="estate-map" className={shell}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">Estate map</h2>
        {asOf ? <span className="text-xs text-muted-foreground">As of {asOf}</span> : null}
      </header>

      <div role="group" aria-label="Filter houses by status" className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f === 'all' ? total : snapshot.counts[f];
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              data-testid={`estate-map-filter-${f}`}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground hover:bg-muted'
              )}
            >
              {f !== 'all' ? <ChipIcon status={f} /> : null}
              {f === 'all' ? 'All' : STATUS_META[f].label}
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        {groups.map((g) => {
          const visible = filter === 'all' ? g.houses : g.houses.filter((h) => h.status === filter);
          if (visible.length === 0) return null;
          return (
            <div key={g.name} data-testid="estate-map-group">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{g.name}</h3>
              <div className={GRID}>
                {visible.map((h) => {
                  const m = STATUS_META[h.status];
                  const Icon = m.icon;
                  return (
                    <Link
                      key={h.id}
                      href={`/houses/${h.id}`}
                      data-status={h.status}
                      aria-label={`House ${h.houseNumber}, ${g.name}, ${m.label}`}
                      className={cn(
                        'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        m.cell
                      )}
                    >
                      {Icon ? <Icon className={cn('h-3 w-3 shrink-0', m.cue)} aria-hidden="true" data-testid={`estate-map-cue-${h.status}`} /> : null}
                      <span className="max-w-full truncate text-foreground">{h.houseNumber}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
