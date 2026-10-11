// @vitest-environment jsdom
//
// #423: the shared per-account portal access control is read-only without
// SYSTEM_ASSIGN_ROLES and calls setPortalAccessOverride with the chosen value.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];

const refreshPortalVisibility = vi.fn();
let currentProfileId = 'self-profile';
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    hasPermission: (p: string) => permissions.includes(p),
    profile: { id: currentProfileId },
    refreshPortalVisibility,
  }),
}));

const setPortalAccessOverride = vi.fn();
vi.mock('@/actions/settings/resident-portal', () => ({
  setPortalAccessOverride: (...args: unknown[]) => setPortalAccessOverride(...args),
  getPortalAccessOverrides: vi.fn(),
  getResidentPortalEnabled: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Native select stand-in: Radix Select does not work in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="Resident portal access"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const { PortalAccessControl } = await import('@/components/admin/portal-access-control');
const { PERMISSIONS } = await import('@/lib/auth/action-roles');

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

function renderControl(props: { override: 'enabled' | 'disabled' | null; generalEnabled: boolean }) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <PortalAccessControl profileId={PROFILE_ID} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  setPortalAccessOverride.mockReset();
  refreshPortalVisibility.mockReset();
  currentProfileId = 'self-profile';
  setPortalAccessOverride.mockResolvedValue({ success: true, error: null });
});
afterEach(() => cleanup());

describe('PortalAccessControl', () => {
  it('is read-only without SYSTEM_ASSIGN_ROLES and shows the effective state', () => {
    permissions = [];
    renderControl({ override: null, generalEnabled: false });
    expect(screen.queryByLabelText('Resident portal access')).toBeNull();
    expect(screen.getByTestId('portal-access-readonly').textContent).toContain('Inherit (currently off)');
  });

  it('shows the effective state next to the select with the permission', () => {
    permissions = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
    renderControl({ override: null, generalEnabled: true });
    expect(screen.getByTestId('portal-access-effective').textContent).toBe('Inherit (currently on)');
  });

  it('calls setPortalAccessOverride with the chosen value, and null for inherit', async () => {
    permissions = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
    renderControl({ override: 'disabled', generalEnabled: false });
    const select = screen.getByLabelText('Resident portal access');

    fireEvent.change(select, { target: { value: 'enabled' } });
    await waitFor(() => expect(setPortalAccessOverride).toHaveBeenCalledWith(PROFILE_ID, 'enabled'));

    fireEvent.change(select, { target: { value: 'inherit' } });
    await waitFor(() => expect(setPortalAccessOverride).toHaveBeenLastCalledWith(PROFILE_ID, null));
  });

  it('refreshes the auth context after a successful save for the current user', async () => {
    permissions = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
    currentProfileId = PROFILE_ID;
    renderControl({ override: null, generalEnabled: false });
    fireEvent.change(screen.getByLabelText('Resident portal access'), { target: { value: 'enabled' } });
    await waitFor(() => expect(refreshPortalVisibility).toHaveBeenCalledTimes(1));
  });

  it('does not refresh the auth context when saving another profile', async () => {
    permissions = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
    renderControl({ override: null, generalEnabled: false });
    fireEvent.change(screen.getByLabelText('Resident portal access'), { target: { value: 'enabled' } });
    await waitFor(() => expect(setPortalAccessOverride).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Resident portal access').hasAttribute('disabled')).toBe(false));
    expect(refreshPortalVisibility).not.toHaveBeenCalled();
  });
});
