'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useHouses } from '@/hooks/use-houses';
import { usePersistedState } from '@/hooks/use-persisted-state';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HouseSearchParams } from '@/lib/validators/house';

// Same keys and "all" sentinel as HousesTable, so the arrows follow the registry's last filter and sort.
const ALL_VALUE = '_all';
// One request covers the whole estate; getHouses already loads every row for its default natural sort.
const NEIGHBOUR_LIMIT = 1000;

type SortBy = HouseSearchParams['sort_by'];

function useRegistryOrder() {
  const [search] = usePersistedState('houses-registry:search', '');
  const [streetId] = usePersistedState<string>('houses-registry:street', ALL_VALUE);
  const [houseTypeId] = usePersistedState<string>('houses-registry:type', ALL_VALUE);
  const [isOccupied] = usePersistedState<string>('houses-registry:occupied', ALL_VALUE);
  const [identifierState] = usePersistedState<string>('houses-registry:identifier', ALL_VALUE);
  const [sortBy] = usePersistedState<SortBy>('houses-registry:sortBy', undefined);
  const [sortOrder] = usePersistedState<'asc' | 'desc'>('houses-registry:sortOrder', 'asc');

  return useHouses({
    search: search || undefined,
    street_id: streetId === ALL_VALUE ? undefined : streetId,
    house_type_id: houseTypeId === ALL_VALUE ? undefined : houseTypeId,
    is_occupied: isOccupied === ALL_VALUE ? undefined : isOccupied === 'true',
    identifier_unverified: identifierState === ALL_VALUE ? undefined : identifierState === 'unverified',
    sort_by: sortBy,
    sort_order: sortBy ? sortOrder : undefined,
    page: 1,
    limit: NEIGHBOUR_LIMIT,
  });
}

function isTypingOrWidgetKey(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // Tabs, menus and form fields already use the arrow keys.
  return Boolean(target.closest('input, textarea, select, [role="tablist"], [role="menu"], [role="listbox"], [role="slider"], [role="dialog"], [role="grid"]'));
}

interface HouseNeighbourNavProps {
  houseId: string;
}

/** Previous/next arrows that step through the houses registry in its current order, keeping the open tab. */
export function HouseNeighbourNav({ houseId }: HouseNeighbourNavProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data } = useRegistryOrder();

  const houses = data?.data ?? [];
  const index = houses.findIndex((h) => h.id === houseId);
  const previous = index > 0 ? houses[index - 1] : undefined;
  const next = index >= 0 && index < houses.length - 1 ? houses[index + 1] : undefined;

  const tab = searchParams.get('tab');
  const hrefFor = (id: string) => `/houses/${id}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`;
  const previousHref = previous ? hrefFor(previous.id) : null;
  const nextHref = next ? hrefFor(next.id) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTypingOrWidgetKey(event.target)) return;
      const href = event.key === 'ArrowLeft' ? previousHref : event.key === 'ArrowRight' ? nextHref : null;
      if (!href) return;
      event.preventDefault();
      router.push(href);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previousHref, nextHref, router]);

  // A house outside the registry's current filter has no place in its order, so show nothing.
  if (index < 0 || houses.length < 2) return null;

  const label = (h: typeof houses[number]) => `${h.house_number} ${h.street?.name ?? ''}`.trim();

  return (
    <div className="flex items-center gap-1" data-testid="house-neighbour-nav">
      <NavButton href={previousHref} label={previous ? `Previous house: ${label(previous)}` : 'No previous house'}>
        <ChevronLeft className="h-4 w-4" />
      </NavButton>
      <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
        {index + 1} of {houses.length}
      </span>
      <NavButton href={nextHref} label={next ? `Next house: ${label(next)}` : 'No next house'}>
        <ChevronRight className="h-4 w-4" />
      </NavButton>
    </div>
  );
}

function NavButton({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const className = 'size-11 md:size-9';
  if (!href) {
    return (
      <Button variant="outline" size="icon" className={className} disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon" className={className} asChild aria-label={label} title={label}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
