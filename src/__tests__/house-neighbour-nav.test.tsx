// @vitest-environment jsdom
// Previous/next arrows on the house detail page: they follow the registry's stored filter and
// sort, keep the open tab, and answer the left/right arrow keys outside form fields and tabs.
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  search: '',
  push: vi.fn(),
  housesParams: [] as Record<string, unknown>[],
  houses: [] as { id: string; house_number: string; street: { name: string } }[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/hooks/use-houses', () => ({
  useHouses: (params: Record<string, unknown>) => {
    mocks.housesParams.push(params);
    return { data: { data: mocks.houses, count: mocks.houses.length } };
  },
}));

import { HouseNeighbourNav } from '@/components/houses/house-neighbour-nav';

const house = (id: string, n: string) => ({ id, house_number: n, street: { name: 'Opera' } });

beforeEach(() => {
  mocks.search = '';
  mocks.push.mockReset();
  mocks.housesParams = [];
  mocks.houses = [house('a', '1'), house('b', '2'), house('c', '3')];
  window.sessionStorage.clear();
});

afterEach(cleanup);

describe('HouseNeighbourNav', () => {
  it('links to the houses either side and shows the position', () => {
    render(<HouseNeighbourNav houseId="b" />);
    expect(screen.getByRole('link', { name: 'Previous house: 1 Opera' })).toHaveAttribute('href', '/houses/a');
    expect(screen.getByRole('link', { name: 'Next house: 3 Opera' })).toHaveAttribute('href', '/houses/c');
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('disables the arrow at either end of the list', () => {
    render(<HouseNeighbourNav houseId="a" />);
    expect(screen.getByRole('button', { name: 'No previous house' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Next house: 2 Opera' })).toBeInTheDocument();
  });

  it('keeps the open tab and drops other query values', () => {
    mocks.search = 'tab=billing&edit=true';
    render(<HouseNeighbourNav houseId="b" />);
    expect(screen.getByRole('link', { name: 'Next house: 3 Opera' })).toHaveAttribute('href', '/houses/c?tab=billing');
  });

  it('shows nothing for a house outside the registry filter', () => {
    render(<HouseNeighbourNav houseId="zzz" />);
    expect(screen.queryByTestId('house-neighbour-nav')).not.toBeInTheDocument();
  });

  it('asks for the whole registry in its stored filter and sort', () => {
    window.sessionStorage.setItem('houses-registry:street', JSON.stringify('street-1'));
    window.sessionStorage.setItem('houses-registry:occupied', JSON.stringify('false'));
    window.sessionStorage.setItem('houses-registry:sortBy', JSON.stringify('street'));
    window.sessionStorage.setItem('houses-registry:sortOrder', JSON.stringify('desc'));
    window.sessionStorage.setItem('houses-registry:page', JSON.stringify(4));
    render(<HouseNeighbourNav houseId="b" />);
    expect(mocks.housesParams.at(-1)).toMatchObject({
      street_id: 'street-1',
      is_occupied: false,
      sort_by: 'street',
      sort_order: 'desc',
      page: 1,
      limit: 1000,
    });
  });

  it('moves with the arrow keys', () => {
    render(<HouseNeighbourNav houseId="b" />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(mocks.push).toHaveBeenLastCalledWith('/houses/c');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(mocks.push).toHaveBeenLastCalledWith('/houses/a');
  });

  it('ignores arrow keys typed in a field, inside tabs, or with a modifier', () => {
    render(
      <>
        <input aria-label="field" />
        <div role="tablist"><button>Billing</button></div>
        <HouseNeighbourNav houseId="b" />
      </>
    );
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByText('Billing'), { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
