// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

// The auto-process limit field on Settings > Gmail Import (#710): visible with
// settings.view, editable only by a super_admin holding settings.manage_general (what
// updateSetting enforces for this key).

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  roleName: 'super_admin' as string | null,
  getSettings: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => mocks.permissions.includes(p)),
    profile: { role_name: mocks.roleName },
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings/banking',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/hooks/use-gmail-connection', () => ({
  useGmailConnectionStatus: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
  useConnectGmail: () => ({ mutate: vi.fn(), isPending: false }),
  useDisconnectGmail: () => ({ mutate: vi.fn(), isPending: false }),
  useManualFetch: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/actions/settings/get-settings', () => ({
  getSettings: (...args: unknown[]) => mocks.getSettings(...args),
  getBillingSettings: vi.fn(),
  getCurrentDevelopmentLevyProfileId: vi.fn(),
}));
vi.mock('@/actions/settings/update-setting', () => ({
  updateSetting: (...args: unknown[]) => mocks.updateSetting(...args),
  updateSettings: vi.fn(),
  setCurrentDevelopmentLevyProfileId: vi.fn(),
}));

import { ApprovalLimitSection } from '@/components/settings/banking/approval-limit-section';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalLimitSection />
    </QueryClientProvider>
  );
}

const field = () => screen.findByRole('textbox');

beforeEach(() => {
  mocks.permissions = [];
  mocks.roleName = 'super_admin';
  mocks.getSettings.mockResolvedValue({
    data: [{ key: 'email_import_auto_process_limit', value: 75000 }],
    error: null,
  });
  mocks.updateSetting.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => cleanup());

describe('Auto-process limit setting (issue #710, moved to Banking in #1274)', () => {
  it('is hidden from someone the Banking page does not admit', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_VIEW];
    renderPage();

    await vi.waitFor(() => expect(mocks.getSettings).toHaveBeenCalled());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('is read-only for a Banking viewer without settings.manage_general, showing the stored value and help text', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE];
    renderPage();

    const input = await field();
    expect(input).toBeDisabled();
    expect(input).toHaveValue('75,000');
    expect(screen.getByText('Auto-matched payments above this amount wait for approval.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Approval limit' })).toBeDisabled();
    expect(mocks.getSettings).toHaveBeenCalledWith('email_integration');
  });

  it('is read-only for a settings.manage_general holder who is not super_admin', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE, PERMISSIONS.SETTINGS_MANAGE_GENERAL];
    mocks.roleName = 'finance_officer';
    renderPage();

    expect(await field()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Approval limit' })).toBeDisabled();
  });

  it('saves a new value through updateSetting for a super_admin', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_MANAGE_REFERENCE, PERMISSIONS.SETTINGS_MANAGE_GENERAL];
    renderPage();

    const input = await field();
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: '90000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Approval limit' }));

    await vi.waitFor(() =>
      expect(mocks.updateSetting).toHaveBeenCalledWith('email_import_auto_process_limit', '90000')
    );
  });
});
