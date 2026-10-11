// @vitest-environment jsdom
//
// #423: the estate-wide resident-portal switch card.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];
const refreshPortalVisibility = vi.fn();
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => permissions.includes(p), refreshPortalVisibility }),
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

const { ResidentPortalCard } = await import('@/app/(dashboard)/settings/estate-info/resident-portal-card');
const { PERMISSIONS } = await import('@/lib/auth/action-roles');

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ResidentPortalCard />
    </QueryClientProvider>
  );
}

const getSwitch = () => screen.findByRole('switch', { name: 'Show resident portal links' });

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

describe('ResidentPortalCard', () => {
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

  it('disables the switch without SETTINGS_MANAGE_GENERAL', async () => {
    permissions = [];
    renderCard();
    const sw = await getSwitch();
    expect(sw.hasAttribute('disabled')).toBe(true);
  });

  it('shows an inline error with retry instead of an off switch when the query fails', async () => {
    getResidentPortalEnabled.mockResolvedValueOnce({ success: false, error: 'boom' });
    renderCard();
    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    getResidentPortalEnabled.mockResolvedValue({ success: true, data: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const sw = await getSwitch();
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
  });
});
