// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  useHouses: vi.fn(),
  clearMutate: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: mocks.hasPermission }),
}));

vi.mock('@/hooks/use-houses', () => ({
  useHouses: mocks.useHouses,
  useClearIdentifierFlag: () => ({
    mutateAsync: mocks.clearMutate,
    isPending: false,
  }),
}));

import { UnverifiedIdentifiersTable } from '@/components/houses/unverified-identifiers-table';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const FLAGGED_HOUSE = {
  id: 'house-1',
  house_number: '3?F?',
  short_name: 'IBB-3?F?',
  identifier_unverified: true,
  identifier_note: 'Register character illegible.',
  street: { name: 'Ibrahim Babatunde' },
  house_type: { name: 'Flat (Apartment)' },
};

/** Grants only the permissions listed, so the gate is exercised for real. */
function grant(...permissions: string[]) {
  mocks.hasPermission.mockImplementation((p: string) => permissions.includes(p));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useHouses.mockReturnValue({
    data: { data: [FLAGGED_HOUSE], count: 1 },
    isLoading: false,
    error: null,
  });
});

afterEach(() => cleanup());

describe('UnverifiedIdentifiersTable (issue #119)', () => {
  it('hides the confirm control from a houses.view-only user', () => {
    grant(PERMISSIONS.HOUSES_VIEW);

    render(<UnverifiedIdentifiersTable />);

    // The row itself is still visible -- view-only means read the queue, not
    // resolve it.
    expect(screen.getByText('3?F?')).toBeInTheDocument();
    expect(screen.getByText('Register character illegible.')).toBeInTheDocument();

    expect(
      screen.queryByRole('button', { name: /Confirm identifier for 3\?F\?/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('shows the confirm control to a houses.update holder', () => {
    grant(PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_UPDATE);

    render(<UnverifiedIdentifiersTable />);

    expect(
      screen.getByRole('button', { name: /Confirm identifier for 3\?F\?/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });

  it('gates on houses.update, not on houses.view', () => {
    grant(PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_UPDATE);

    render(<UnverifiedIdentifiersTable />);

    expect(mocks.hasPermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_UPDATE);
    expect(mocks.hasPermission).not.toHaveBeenCalledWith(PERMISSIONS.HOUSES_VIEW);
  });

  it('asks the server for flagged houses only', () => {
    grant(PERMISSIONS.HOUSES_UPDATE);

    render(<UnverifiedIdentifiersTable />);

    expect(mocks.useHouses).toHaveBeenCalledWith(
      expect.objectContaining({ identifier_unverified: true })
    );
  });

  it('renders an empty state when nothing is awaiting confirmation', () => {
    grant(PERMISSIONS.HOUSES_UPDATE);
    mocks.useHouses.mockReturnValue({ data: { data: [], count: 0 }, isLoading: false, error: null });

    render(<UnverifiedIdentifiersTable />);

    expect(screen.getByText('No unconfirmed identifiers')).toBeInTheDocument();
  });
});
