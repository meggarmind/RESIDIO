'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { HouseStatusMeta } from '@/components/houses/house-status-maps';

export interface HouseTileHouse<K extends string> {
  id: string;
  houseNumber: string;
  streetName: string | null;
  status: K;
}

export const HOUSE_TILE_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2';

interface HouseTileGridProps<K extends string> {
  houses: HouseTileHouse<K>[];
  statusMeta: Record<K, HouseStatusMeta>;
  /** Order of the filter chips after "All". */
  filterOrder: K[];
  /** Chip counts. Computed from `houses` when omitted. */
  counts?: Record<K, number>;
  /** Tile link target. Defaults to the house page. */
  hrefFor?: (house: HouseTileHouse<K>) => string;
  /** Prefix for data-testid values: `<prefix>-filter-<k>`, `<prefix>-group`, `<prefix>-cue-<k>`. */
  testIdPrefix?: string;
}

function groupByStreet<K extends string>(houses: HouseTileHouse<K>[]) {
  const groups = new Map<string, HouseTileHouse<K>[]>();
  for (const h of houses) {
    const key = h.streetName ?? 'No street';
    const list = groups.get(key);
    if (list) list.push(h);
    else groups.set(key, [h]);
  }
  return Array.from(groups, ([name, list]) => ({ name, houses: list }));
}

/** Street-grouped house tiles with status filter chips that double as the legend. */
export function HouseTileGrid<K extends string>({
  houses,
  statusMeta,
  filterOrder,
  counts,
  hrefFor = (h) => `/houses/${h.id}`,
  testIdPrefix = 'house-tile',
}: HouseTileGridProps<K>) {
  const [filter, setFilter] = useState<'all' | K>('all');
  const groups = useMemo(() => groupByStreet(houses), [houses]);
  const countFor = (k: K) => counts?.[k] ?? houses.filter((h) => h.status === k).length;
  const filters: ('all' | K)[] = ['all', ...filterOrder];

  return (
    <>
      <div role="group" aria-label="Filter houses by status" className="mt-3 flex flex-wrap gap-2">
        {filters.map((f) => {
          const count = f === 'all' ? houses.length : countFor(f);
          const active = filter === f;
          const meta = f === 'all' ? null : statusMeta[f];
          const ChipIcon = meta?.icon;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              data-testid={`${testIdPrefix}-filter-${f}`}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground hover:bg-muted'
              )}
            >
              {meta && ChipIcon ? <ChipIcon className={cn('h-3 w-3 shrink-0', meta.cue)} aria-hidden="true" /> : null}
              {meta ? meta.label : 'All'}
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
            <div key={g.name} data-testid={`${testIdPrefix}-group`}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{g.name}</h3>
              <div className={HOUSE_TILE_GRID}>
                {visible.map((h) => {
                  const m = statusMeta[h.status];
                  const Icon = m.icon;
                  return (
                    <Link
                      key={h.id}
                      href={hrefFor(h)}
                      data-status={h.status}
                      aria-label={`House ${h.houseNumber}, ${g.name}, ${m.label}`}
                      className={cn(
                        'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-1 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        m.cell
                      )}
                    >
                      {Icon ? <Icon className={cn('h-3 w-3 shrink-0', m.cue)} aria-hidden="true" data-testid={`${testIdPrefix}-cue-${h.status}`} /> : null}
                      <span className="max-w-full truncate text-foreground">{h.houseNumber}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
