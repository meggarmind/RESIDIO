// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  push: vi.fn(),
  retry: vi.fn(),
  listEmailImports: vi.fn(),
  getEmailImportSummary: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/payments/email-imports',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/actions/email-imports/create-email-import', () => ({
  listEmailImports: (...a: unknown[]) => mocks.listEmailImports(...a),
  getEmailImportSummary: (...a: unknown[]) => mocks.getEmailImportSummary(...a),
}));
vi.mock('@/hooks/use-gmail-connection', () => ({
  useManualFetch: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelImport: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryImport: () => ({ mutate: mocks.retry, isPending: false }),
}));

import EmailImportsPage from '@/app/(dashboard)/payments/email-imports/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const base = {
  source_email: 'bank@example.com',
  trigger_type: 'cron',
  emails_fetched: 1,
  transactions_extracted: 1,
  transactions_auto_processed: 1,
  transactions_queued: 0,
  started_at: null,
  completed_at: null,
};
const ROWS = [
  { ...base, id: 'imp-ok', status: 'completed', created_at: '2026-10-20T14:30:00Z' },
  { ...base, id: 'imp-bad', status: 'failed', created_at: '2026-10-19T09:00:00Z' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailImportsPage />
    </QueryClientProvider>
  );
}

describe('email imports list page', () => {
  beforeEach(() => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_TRIGGER];
    mocks.push.mockReset();
    mocks.retry.mockReset();
    mocks.listEmailImports.mockReset().mockResolvedValue({ data: ROWS, count: 2, error: null });
    mocks.getEmailImportSummary.mockReset().mockResolvedValue({
      data: { total: 321, completed: 300, queued: 42, autoProcessed: 77 },
      error: null,
    });
  });
  afterEach(cleanup);

  it('shows the summary values from all rows', async () => {
    renderPage();
    expect(await screen.findByText('321')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();
  });

  it('opens an import when its row is clicked', async () => {
    renderPage();
    const rows = await screen.findAllByRole('link');
    fireEvent.click(rows[0]);
    expect(mocks.push).toHaveBeenCalledWith('/payments/email-imports/imp-ok');
  });

  it('opens an import on Enter and Space from the focused row', async () => {
    renderPage();
    const rows = await screen.findAllByRole('link');
    expect(rows[0]).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    fireEvent.keyDown(rows[1], { key: ' ' });
    expect(mocks.push).toHaveBeenNthCalledWith(1, '/payments/email-imports/imp-ok');
    expect(mocks.push).toHaveBeenNthCalledWith(2, '/payments/email-imports/imp-bad');
  });

  it('does not navigate when Retry is clicked or pressed', async () => {
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Retry Processing' });
    fireEvent.click(retry);
    fireEvent.keyDown(retry, { key: 'Enter' });
    expect(mocks.retry).toHaveBeenCalledWith('imp-bad');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('filters by the Queued card and marks it pressed', async () => {
    renderPage();
    await screen.findAllByRole('link');
    const card = screen.getByRole('button', { name: /Queued for Review/ });
    expect(card).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(card);
    await waitFor(() =>
      expect(mocks.listEmailImports).toHaveBeenLastCalledWith({ has: 'queued', limit: 25, offset: 0 })
    );
    expect(screen.getByRole('button', { name: /Queued for Review/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Imports with queued transactions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all imports' })).toBeInTheDocument();
  });

  it('uses month names and the server count in the footer', async () => {
    renderPage();
    expect(await screen.findByText('20 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 2 of 2')).toBeInTheDocument();
  });
  it('hides Retry and Cancel without the trigger permission', async () => {
    mocks.permissions = [];
    mocks.listEmailImports.mockResolvedValue({
      data: [...ROWS, { ...base, id: 'imp-run', status: 'processing', created_at: '2026-10-19T08:00:00Z' }],
      count: 3,
      error: null,
    });
    renderPage();
    await screen.findAllByRole('link');
    expect(screen.queryByRole('button', { name: 'Retry Processing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel Import' })).not.toBeInTheDocument();
  });

  it('filters by the Completed and Auto-Processed cards', async () => {
    renderPage();
    await screen.findAllByRole('link');
    fireEvent.click(screen.getByRole('button', { name: /^Completed/ }));
    await waitFor(() =>
      expect(mocks.listEmailImports).toHaveBeenLastCalledWith({ status: 'completed', limit: 25, offset: 0 })
    );
    fireEvent.click(screen.getByRole('button', { name: /Auto-Processed/ }));
    await waitFor(() =>
      expect(mocks.listEmailImports).toHaveBeenLastCalledWith({ has: 'auto_processed', limit: 25, offset: 0 })
    );
  });

  it('goes back to page 1 when a card is selected', async () => {
    mocks.listEmailImports.mockResolvedValue({ data: ROWS, count: 60, error: null });
    renderPage();
    await screen.findAllByRole('link');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() =>
      expect(mocks.listEmailImports).toHaveBeenLastCalledWith({ limit: 25, offset: 25 })
    );
    fireEvent.click(screen.getByRole('button', { name: /Queued for Review/ }));
    await waitFor(() =>
      expect(mocks.listEmailImports).toHaveBeenLastCalledWith({ has: 'queued', limit: 25, offset: 0 })
    );
  });
});
