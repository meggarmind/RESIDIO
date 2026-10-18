// @vitest-environment jsdom
//
// #758 slice 3: estate map. Honest states, counts equal drawn cells, street grouping,
// filter behaviour, accessible cell links, non-colour status cue.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { EstateMapHouse, EstateMapSnapshot, EstateMapStatus } from '@/types/estate-map';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EstateMap } from '@/components/dashboard/estate-map';

afterEach(cleanup);

const house = (id: string, n: string, street: string | null, status: EstateMapStatus): EstateMapHouse => ({
  id,
  houseNumber: n,
  streetId: street ? `s-${street}` : null,
  streetName: street,
  status,
});

const houses: EstateMapHouse[] = [
  house('1', '1', 'Palm Close', 'paid_up'),
  house('2', '2', 'Palm Close', 'overdue'),
  house('3', '3', 'Palm Close', 'outstanding'),
  house('4', '10', 'Ash Road', 'no_invoice'),
  house('5', '11', 'Ash Road', 'overdue'),
  house('6', '7', null, 'paid_up'),
];

const snap = (hs: EstateMapHouse[] = houses): EstateMapSnapshot => {
  const counts = { paid_up: 0, outstanding: 0, overdue: 0, no_invoice: 0 };
  for (const h of hs) counts[h.status] += 1;
  return { houses: hs, counts, asOf: '2026-10-18T10:00:00.000Z' };
};

const renderMap = (p: Partial<React.ComponentProps<typeof EstateMap>> = {}) =>
  render(<EstateMap snapshot={snap()} isLoading={false} error={null} {...p} />);

describe('EstateMap states', () => {
  it('shows a skeleton while loading', () => {
    renderMap({ snapshot: null, isLoading: true });
    expect(screen.getByTestId('estate-map-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('estate-map')).not.toBeInTheDocument();
  });

  it('says it is unavailable on failure, never "no houses"', () => {
    renderMap({ snapshot: null, error: 'boom' });
    expect(screen.getByTestId('estate-map-unavailable')).toHaveTextContent(/could not be loaded/i);
    expect(screen.queryByText(/no houses yet/i)).not.toBeInTheDocument();
  });

  it('shows a quiet locked state when unauthorized', () => {
    renderMap({ snapshot: null, error: 'Unauthorized' });
    expect(screen.getByTestId('estate-map-locked')).toHaveTextContent(/isn.t available for your role/i);
    expect(screen.queryByTestId('estate-map-unavailable')).not.toBeInTheDocument();
  });

  it('shows an empty state linking to Houses', () => {
    renderMap({ snapshot: snap([]) });
    expect(screen.getByTestId('estate-map-empty')).toHaveTextContent('No houses yet');
    expect(screen.getByRole('link', { name: /go to houses/i })).toHaveAttribute('href', '/houses');
  });
});

describe('EstateMap ready', () => {
  it('draws one cell per house and legend counts equal what is drawn', () => {
    renderMap();
    expect(screen.getAllByRole('link', { name: /^House / })).toHaveLength(6);
    const expected = { all: 6, overdue: 2, outstanding: 1, paid_up: 2, no_invoice: 1 };
    for (const [k, n] of Object.entries(expected)) {
      expect(screen.getByTestId(`estate-map-filter-${k}`)).toHaveTextContent(String(n));
      if (k !== 'all') {
        expect(document.querySelectorAll(`a[data-status="${k}"]`)).toHaveLength(n);
      }
    }
  });

  it('shows the as-of time', () => {
    renderMap();
    expect(screen.getByText(/^As of /)).toBeInTheDocument();
  });

  it('groups by street in returned order, with null street under "No street"', () => {
    renderMap();
    const groups = screen.getAllByTestId('estate-map-group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['Palm Close', 'Ash Road', 'No street']);
    expect(within(groups[0]).getAllByRole('link')).toHaveLength(3);
    expect(within(groups[2]).getAllByRole('link')).toHaveLength(1);
  });

  it('cell links to the house with an accessible name', () => {
    renderMap();
    const cell = screen.getByRole('link', { name: 'House 2, Palm Close, Overdue' });
    expect(cell).toHaveAttribute('href', '/houses/2');
    expect(screen.getByRole('link', { name: 'House 7, No street, Paid up' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'House 3, Palm Close, Outstanding' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'House 10, Ash Road, No invoice' })).toBeInTheDocument();
  });

  it('carries a distinct icon shape per status', () => {
    renderMap();
    const shape = { overdue: 'lucide-triangle-alert', outstanding: 'lucide-clock', paid_up: 'lucide-check', no_invoice: 'lucide-minus' };
    for (const [status, cls] of Object.entries(shape)) {
      const cues = screen.getAllByTestId(`estate-map-cue-${status}`);
      expect(cues.length).toBeGreaterThan(0);
      cues.forEach((c) => expect(c.getAttribute('class')).toContain(cls));
    }
  });

  it('cells are neutral with the house number in foreground and no status-* tokens', () => {
    renderMap();
    document.querySelectorAll('a[data-status]').forEach((a) => {
      expect(a.className).toContain('bg-card');
      expect(a.className).not.toMatch(/status-/);
      expect(a.querySelector('span')?.className).toContain('text-foreground');
    });
  });

  it('filters: one active button, hides non-matching cells and empty groups, keeps legend counts', () => {
    renderMap();
    expect(screen.getByTestId('estate-map-filter-all')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('estate-map-filter-overdue'));
    expect(screen.getByTestId('estate-map-filter-overdue')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('estate-map-filter-all')).toHaveAttribute('aria-pressed', 'false');
    const links = screen.getAllByRole('link', { name: /^House / });
    expect(links).toHaveLength(2);
    links.forEach((l) => expect(l).toHaveAttribute('data-status', 'overdue'));
    expect(screen.getAllByTestId('estate-map-group')).toHaveLength(2);
    expect(screen.getByTestId('estate-map-filter-all')).toHaveTextContent('6');
    expect(screen.getByTestId('estate-map-filter-paid_up')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('estate-map-filter-all'));
    expect(screen.getAllByRole('link', { name: /^House / })).toHaveLength(6);
  });
});
