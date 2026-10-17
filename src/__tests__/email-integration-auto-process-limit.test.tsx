// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

// The auto-process limit field on Settings > Gmail Import (#710): visible with
// settings.view, editable only with settings.manage_general (what updateSetting enforces).

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  getSettings: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => mocks.permissions.includes(p) }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
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

import EmailIntegrationPage from '@/app/(dashboard)/settings/email-integration/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailIntegrationPage />
    </QueryClientProvider>
  );
}

const field = () => screen.findByLabelText('Auto-process limit (NGN)');

beforeEach(() => {
  mocks.permissions = [];
  mocks.getSettings.mockResolvedValue({
    data: [{ key: 'email_import_auto_process_limit', value: 75000 }],
    error: null,
  });
  mocks.updateSetting.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => cleanup());

describe('Auto-process limit setting (issue #710)', () => {
  it('is hidden without settings.view', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW];
    renderPage();

    expect(await screen.findByText('Gmail Connection')).toBeInTheDocument();
    expect(screen.queryByLabelText('Auto-process limit (NGN)')).not.toBeInTheDocument();
  });

  it('is read-only with settings.view alone, showing the stored value and help text', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_VIEW];
    renderPage();

    const input = await field();
    expect(input).toBeDisabled();
    expect(input).toHaveValue('75,000');
    expect(screen.getByText('Auto-matched payments above this amount wait for approval.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(mocks.getSettings).toHaveBeenCalledWith('email_integration');
  });

  it('saves a new value through updateSetting with settings.manage_general', async () => {
    mocks.permissions = [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_MANAGE_GENERAL];
    renderPage();

    const input = await field();
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: '90000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() =>
      expect(mocks.updateSetting).toHaveBeenCalledWith('email_import_auto_process_limit', '90000')
    );
  });
});
