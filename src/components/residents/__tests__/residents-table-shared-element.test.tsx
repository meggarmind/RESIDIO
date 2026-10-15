// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true }),
}));
vi.mock('@/lib/utils/accessibility', () => ({ prefersReducedMotion: () => false }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-persisted-state', async () => {
  const { useState } = await import('react');
  return { usePersistedState: <T,>(_key: string, initial: T) => useState<T>(initial) };
});
vi.mock('@/hooks/use-reference', () => ({ useStreets: () => ({ data: [] }) }));
vi.mock('@/hooks/use-residents', () => ({
  useAdminResidents: () => ({
    isLoading: false,
    error: null,
    data: {
      count: 1,
      data: [
        {
          id: 'res-1',
          resident_code: 'R-001',
          first_name: 'Ada',
          last_name: 'Obi',
          phone_primary: '0800',
          account_status: 'active',
          resident_houses: [],
        },
      ],
    },
  }),
  useContactVerificationStats: () => ({ data: undefined }),
}));
vi.mock('@/components/residents/resident-quick-view', () => ({ ResidentQuickView: () => null }));

import { ResidentsTable } from '../residents-table';
import { navigateWithSharedElement } from '@/lib/navigation/shared-element-transition';

type Doc = { startViewTransition?: unknown };

/** Starts a real shared-element navigation that stays "in flight" until finish(). */
function startInFlightTransition(name: string) {
  const state = { finish: () => {} };
  (document as unknown as Doc).startViewTransition = () => ({
    finished: new Promise<void>((r) => { state.finish = r; }),
  });
  const done = navigateWithSharedElement({
    push: () => {},
    href: '/residents',
    sourceEl: document.createElement('div'),
    name,
  });
  return { ...state, done };
}

const getRow = () => screen.getByText('Ada Obi').closest('tr') as HTMLElement;

beforeEach(() => mocks.push.mockReset());
afterEach(() => {
  cleanup();
  delete (document as unknown as Doc).startViewTransition;
  delete document.documentElement.dataset.sharedTransition;
});

describe('ResidentRow shared-element transition', () => {
  it('names the returning row while the flag is set and the remembered name matches', async () => {
    const t = startInFlightTransition('resident-res-1');
    render(<ResidentsTable />);
    expect(getRow().style.viewTransitionName).toBe('resident-res-1');
    expect(getRow().dataset.sharedTarget).toBe('true');

    // After the transition finishes nothing is left behind.
    t.finish();
    await t.done;
    expect(getRow().style.viewTransitionName).toBe('');
    expect(getRow().dataset.sharedTarget).toBeUndefined();
  });

  it('does not name the row when the remembered name is for a different resident', async () => {
    const t = startInFlightTransition('resident-someone-else');
    render(<ResidentsTable />);
    expect(getRow().style.viewTransitionName).toBe('');
    expect(getRow().dataset.sharedTarget).toBeUndefined();
    t.finish();
    await t.done;
  });

  it('does not name the row when no shared transition is active', () => {
    render(<ResidentsTable />);
    expect(getRow().style.viewTransitionName).toBe('');
    expect(getRow().dataset.sharedTarget).toBeUndefined();
  });

  it('does not name the row when the flag is unset even if a name is remembered', async () => {
    const t = startInFlightTransition('resident-res-1');
    delete document.documentElement.dataset.sharedTransition;
    render(<ResidentsTable />);
    expect(getRow().style.viewTransitionName).toBe('');
    t.finish();
    await t.done;
  });

  it('names only the clicked row and starts a view transition on click', () => {
    const start = vi.fn(() => ({ finished: new Promise<void>(() => {}) }));
    (document as unknown as Doc).startViewTransition = start;
    render(<ResidentsTable />);
    expect(getRow().style.viewTransitionName).toBe('');
    fireEvent.click(getRow());
    expect(start).toHaveBeenCalledOnce();
    expect(getRow().style.viewTransitionName).toBe('resident-res-1');
  });

  it('falls back to router.push on a modified click', () => {
    const start = vi.fn();
    (document as unknown as Doc).startViewTransition = start;
    render(<ResidentsTable />);
    fireEvent.click(getRow(), { ctrlKey: true });
    expect(start).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/residents/res-1');
  });
});
