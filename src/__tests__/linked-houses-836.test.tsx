// @vitest-environment jsdom
//
// Issue #836: Move Out, Transfer and Remove on the resident detail page confirm through the
// shared ConfirmAction dialog (#790), naming the resident and house, not the native confirm().

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { LinkedHouses } from '@/components/residents/linked-houses';
import type { ResidentWithHouses } from '@/types/database';

const unassign = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => permission === 'houses.assign_resident' }),
}));

vi.mock('@/hooks/use-residents', () => ({
  useResidents: () => ({ data: undefined }),
  useAssignHouse: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnassignHouse: () => unassign,
}));

vi.mock('@/hooks/use-houses', () => ({
  useHousesWithRoles: () => ({ data: undefined }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const nativeConfirm = vi.fn(() => true);

beforeEach(() => {
  unassign.mutateAsync.mockReset().mockResolvedValue({});
  vi.stubGlobal('confirm', nativeConfirm);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const house = (id: string, number: string) => ({ id, house_number: number, short_name: id.toUpperCase(), street: { name: 'Oak Street' } });

const RESIDENT = {
  id: 'r1',
  first_name: 'Ada',
  last_name: 'Obi',
  resident_type: 'primary',
  entity_type: 'individual',
  resident_houses: [
    { id: 'rh1', house_id: 'h1', resident_role: 'resident_landlord', is_active: true, move_in_date: '2025-01-01', house: house('h1', '1') },
    { id: 'rh2', house_id: 'h2', resident_role: 'co_resident', is_active: true, move_in_date: '2025-01-01', house: house('h2', '2') },
  ],
} as unknown as ResidentWithHouses;

describe('LinkedHouses unassign confirmation (#836)', () => {
  it.each([
    ['Move out (become property owner)', 'Move out', 'h1', /Ada Obi will be marked as moved out of .*H1.*property owner/],
    ['Transfer property', 'Transfer', 'h1', /Ada Obi will give up ownership of .*H1/],
    ['Remove assignment', 'Remove', 'h2', /Ada Obi will be removed from .*H2/],
  ])('%s opens the confirm dialog naming the resident and house, and runs only on confirm', async (button, confirmLabel, houseId, text) => {
    render(<LinkedHouses resident={RESIDENT} />);
    fireEvent.click(screen.getByRole('button', { name: button }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(text);
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(unassign.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
    await waitFor(() => expect(unassign.mutateAsync).toHaveBeenCalledWith({ residentId: 'r1', houseId }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('cancel runs nothing', async () => {
    render(<LinkedHouses resident={RESIDENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove assignment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(unassign.mutateAsync).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when the update fails', async () => {
    unassign.mutateAsync.mockRejectedValue(new Error('boom'));
    render(<LinkedHouses resident={RESIDENT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove assignment' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(unassign.mutateAsync).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
