// @vitest-environment jsdom
//
// #1398: shared house tile grid. Street grouping, chip filtering and counts,
// status labels and icons for the occupancy map, custom link target.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HouseTileGrid, type HouseTileHouse } from '@/components/houses/house-tile-grid';
import {
  OCCUPANCY_STATUS_META,
  PAYMENT_STATUS_META,
  type OccupancyStatusKey,
} from '@/components/houses/house-status-maps';

afterEach(cleanup);

const h = (id: string, n: string, street: string | null, status: OccupancyStatusKey): HouseTileHouse<OccupancyStatusKey> => ({
  id,
  houseNumber: n,
  streetName: street,
  status,
});

const houses = [
  h('1', '1', 'Palm Close', 'owner_occupied'),
  h('2', '2', 'Palm Close', 'empty'),
  h('3', '3', 'Palm Close', 'tenant_occupied'),
  h('4', '10', 'Ash Road', 'empty'),
  h('5', '7', null, 'owner_occupied'),
];
const order: OccupancyStatusKey[] = ['owner_occupied', 'tenant_occupied', 'empty'];

const renderGrid = (p: Partial<React.ComponentProps<typeof HouseTileGrid<OccupancyStatusKey>>> = {}) =>
  render(<HouseTileGrid houses={houses} statusMeta={OCCUPANCY_STATUS_META} filterOrder={order} {...p} />);

describe('HouseTileGrid', () => {
  it('groups tiles by street, with No street for houses without one', () => {
    renderGrid();
    const groups = screen.getAllByTestId('house-tile-group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['Palm Close', 'Ash Road', 'No street']);
    expect(within(groups[0]).getAllByRole('link')).toHaveLength(3);
  });

  it('shows a count on every chip, computed from the houses', () => {
    renderGrid();
    expect(screen.getByTestId('house-tile-filter-all')).toHaveTextContent('All5');
    expect(screen.getByTestId('house-tile-filter-owner_occupied')).toHaveTextContent('Owner occupied2');
    expect(screen.getByTestId('house-tile-filter-tenant_occupied')).toHaveTextContent('Tenant occupied1');
    expect(screen.getByTestId('house-tile-filter-empty')).toHaveTextContent('Empty2');
  });

  it('uses supplied counts when given', () => {
    renderGrid({ counts: { owner_occupied: 9, tenant_occupied: 8, empty: 7 } });
    expect(screen.getByTestId('house-tile-filter-empty')).toHaveTextContent('Empty7');
  });

  it('filters by chip, hides empty groups and restores on All', () => {
    renderGrid();
    fireEvent.click(screen.getByTestId('house-tile-filter-empty'));
    expect(screen.getByTestId('house-tile-filter-empty')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByTestId('house-tile-group')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('house-tile-filter-all'));
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('renders occupancy labels in aria-labels and marks only Empty with an icon', () => {
    renderGrid();
    expect(screen.getByRole('link', { name: 'House 1, Palm Close, Owner occupied' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'House 3, Palm Close, Tenant occupied' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'House 2, Palm Close, Empty' })).toBeInTheDocument();
    expect(screen.getAllByTestId('house-tile-cue-empty')).toHaveLength(2);
    expect(screen.queryByTestId('house-tile-cue-owner_occupied')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-tile-cue-tenant_occupied')).not.toBeInTheDocument();
  });

  it('shows the legend icon in a flagged chip (occupancy) and not in a plain one', () => {
    renderGrid();
    expect(screen.getByTestId('house-tile-filter-empty').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('house-tile-filter-owner_occupied').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('house-tile-filter-all').querySelector('svg')).toBeNull();
  });

  it('shows the legend icon in the Overdue chip (payment) and not in Paid up', () => {
    render(
      <HouseTileGrid
        houses={[{ id: 'p1', houseNumber: '1', streetName: 'A', status: 'overdue' as const }]}
        statusMeta={PAYMENT_STATUS_META}
        filterOrder={['overdue', 'paid_up']}
      />
    );
    expect(screen.getByTestId('house-tile-filter-overdue').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('house-tile-filter-paid_up').querySelector('svg')).toBeNull();
  });

  it('links to the house page by default and honours hrefFor', () => {
    const { unmount } = renderGrid();
    expect(screen.getByRole('link', { name: /House 1,/ })).toHaveAttribute('href', '/houses/1');
    unmount();
    renderGrid({ hrefFor: (x) => `/dues?house=${x.id}` });
    expect(screen.getByRole('link', { name: /House 1,/ })).toHaveAttribute('href', '/dues?house=1');
  });

  it('honours testIdPrefix', () => {
    renderGrid({ testIdPrefix: 'occ' });
    expect(screen.getByTestId('occ-filter-all')).toBeInTheDocument();
    expect(screen.getAllByTestId('occ-group')).toHaveLength(3);
  });
});

describe('status maps', () => {
  it('keeps the payment map labels', () => {
    expect(Object.values(PAYMENT_STATUS_META).map((m) => m.label)).toEqual(['Overdue', 'Outstanding', 'Paid up', 'No invoice']);
  });

  it('occupancy map flags only Empty', () => {
    expect(OCCUPANCY_STATUS_META.empty.icon).not.toBeNull();
    expect(OCCUPANCY_STATUS_META.owner_occupied.icon).toBeNull();
    expect(OCCUPANCY_STATUS_META.tenant_occupied.icon).toBeNull();
  });
});
