// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

// Settings > Gmail Import > Import rules (#1349): readable by anyone the page admits,
// editable only with email_imports.configure (what updateSyncCriteria enforces).

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  getGmailConnectionStatus: vi.fn(),
  updateSyncCriteria: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => mocks.permissions.includes(p)),
    profile: { role_name: 'super_admin' },
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings/email-integration',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/actions/email-imports/gmail-oauth', () => ({
  getGmailConnectionStatus: (...args: unknown[]) => mocks.getGmailConnectionStatus(...args),
  updateSyncCriteria: (...args: unknown[]) => mocks.updateSyncCriteria(...args),
  getGmailAuthUrl: vi.fn(),
  disconnectGmail: vi.fn(),
}));
vi.mock('@/actions/email-imports/control-import', () => ({ cancelImport: vi.fn(), retryImportProcessing: vi.fn() }));
vi.mock('@/actions/email-imports/reset-email-imports', () => ({ resetEmailImports: vi.fn() }));
vi.mock('@/actions/email-imports/fetch-emails', () => ({ fetchNewEmails: vi.fn() }));

import { ImportRulesSection } from '@/components/settings/email-integration/import-rules-section';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportRulesSection />
    </QueryClientProvider>
  );
}

const connected = {
  connected: true,
  email: 'residio.box@gmail.com',
  syncCriteria: { senders: ['firstbanknigeria.com', 'opera4street@gmail.com'], keywords: ['alert'] },
};
const sendersField = () => screen.findByRole('textbox', { name: 'Senders' });
const saveButton = () => screen.getByRole('button', { name: 'Save Import rules' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW];
  mocks.getGmailConnectionStatus.mockResolvedValue({ data: connected, error: null });
  mocks.updateSyncCriteria.mockResolvedValue({ error: null });
});
afterEach(() => cleanup());

describe('Gmail import rules section (#1349)', () => {
  it('is hidden while Gmail is not connected', async () => {
    mocks.getGmailConnectionStatus.mockResolvedValue({ data: { connected: false, email: null }, error: null });
    renderSection();
    await vi.waitFor(() => expect(mocks.getGmailConnectionStatus).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('textbox', { name: 'Senders' })).not.toBeInTheDocument();
  });

  it('shows the stored rules read-only without email_imports.configure', async () => {
    renderSection();
    const senders = await sendersField();
    expect(senders).toHaveValue('firstbanknigeria.com\nopera4street@gmail.com');
    expect(senders).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Subject words' })).toHaveValue('alert');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Only users who can configure Gmail import can change these rules.')).toBeInTheDocument();
  });

  it('saves the cleaned rules for a configure holder', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW, PERMISSIONS.EMAIL_IMPORTS_CONFIGURE];
    renderSection();
    const senders = await sendersField();
    expect(senders).toBeEnabled();
    expect(screen.queryByText('Only users who can configure Gmail import can change these rules.')).not.toBeInTheDocument();
    fireEvent.change(senders, { target: { value: 'FirstBank.com\n\nopera4street@gmail.com\n' } });
    fireEvent.click(saveButton());

    await vi.waitFor(() =>
      expect(mocks.updateSyncCriteria).toHaveBeenCalledWith({
        senders: ['firstbank.com', 'opera4street@gmail.com'],
        keywords: ['alert'],
      })
    );
  });

  it('blocks saving an invalid sender and says why', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW, PERMISSIONS.EMAIL_IMPORTS_CONFIGURE];
    renderSection();
    fireEvent.change(await sendersField(), { target: { value: 'x.com OR in:anywhere' } });

    expect(screen.getByRole('alert')).toHaveTextContent('"x.com or in:anywhere" is not an email address or a domain.');
    expect(saveButton()).toBeDisabled();
    expect(mocks.updateSyncCriteria).not.toHaveBeenCalled();
  });
});
