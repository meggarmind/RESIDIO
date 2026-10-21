// @vitest-environment jsdom
//
// #423: the estate-wide resident-portal switch card.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];
const refreshPortalVisibility = vi.fn();
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => permissions.includes(p)),
    refreshPortalVisibility,
  }),
}));

const setResidentPortalEnabled = vi.fn();
const getResidentPortalEnabled = vi.fn();
vi.mock('@/actions/settings/resident-portal', () => ({
  setResidentPortalEnabled: (...a: unknown[]) => setResidentPortalEnabled(...a),
  getResidentPortalEnabled: (...a: unknown[]) => getResidentPortalEnabled(...a),
  getPortalAccessOverrides: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

const { ResidentPortalSection } = await import('@/components/settings/estate/resident-portal-section');
const { PERMISSIONS } = await import('@/lib/auth/action-roles');

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ResidentPortalSection />
    </QueryClientProvider>
  );
}

// The section starts collapsed, so its body is hidden until opened.
const getSwitch = () => screen.findByRole('switch', { name: 'Show resident portal links', hidden: true });

beforeEach(() => {
  permissions = [PERMISSIONS.SETTINGS_MANAGE_GENERAL];
  setResidentPortalEnabled.mockReset();
  getResidentPortalEnabled.mockReset();
  refreshPortalVisibility.mockReset();
  toastError.mockReset();
  getResidentPortalEnabled.mockResolvedValue({ success: true, data: false });
  setResidentPortalEnabled.mockResolvedValue({ success: true });
});
afterEach(() => cleanup());

describe('ResidentPortalSection', () => {
  it('saves and refreshes the auth context on a successful toggle', async () => {
    renderCard();
    fireEvent.click(await getSwitch());
    await waitFor(() => expect(setResidentPortalEnabled).toHaveBeenCalledWith(true));
    await waitFor(() => expect(refreshPortalVisibility).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('rolls the switch back and toasts when the save fails', async () => {
    setResidentPortalEnabled.mockResolvedValue({ success: false, error: 'denied' });
    renderCard();
    const sw = await getSwitch();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('denied'));
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'));
    expect(refreshPortalVisibility).not.toHaveBeenCalled();
  });

  it('renders no switch without SETTINGS_MANAGE_GENERAL', async () => {
    permissions = [];
    renderCard();
    expect(screen.queryByRole('switch', { hidden: true })).toBeNull();
    expect(screen.queryByText('Resident portal')).toBeNull();
  });

  it('shows an inline error with retry instead of an off switch when the query fails', async () => {
    getResidentPortalEnabled.mockResolvedValueOnce({ success: false, error: 'boom' });
    renderCard();
    expect(await screen.findByRole('alert', { hidden: true })).not.toBeNull();
    expect(screen.queryByRole('switch', { hidden: true })).toBeNull();

    getResidentPortalEnabled.mockResolvedValue({ success: true, data: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry', hidden: true }));
    const sw = await getSwitch();
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
  });
});
