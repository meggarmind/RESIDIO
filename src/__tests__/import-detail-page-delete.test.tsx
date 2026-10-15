// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  record: {} as Record<string, unknown>,
  getImport: vi.fn(),
  deleteImport: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ importId: 'imp-1' }),
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: mocks.refresh, back: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/actions/imports', () => ({
  getImport: (...a: unknown[]) => mocks.getImport(...a),
  getImportRowSummary: async () => ({ data: null, error: null }),
  deleteImport: (...a: unknown[]) => mocks.deleteImport(...a),
}));
vi.mock('@/actions/imports/bank-accounts', () => ({}));
vi.mock('@/actions/residents/aliases', () => ({}));
vi.mock('@/components/imports/import-approval-panel', () => ({
  ImportApprovalPanel: () => <div>approval panel</div>,
}));
vi.mock('@/components/imports/import-summary-tiles', () => ({
  ImportSummaryTiles: () => <div>tiles</div>,
}));

import ImportDetailPage from '@/app/(dashboard)/payments/import/[importId]/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportDetailPage />
    </QueryClientProvider>,
  );
}

const deleteBtn = () => screen.queryByRole('button', { name: /Delete import/ });

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.IMPORTS_CREATE];
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.deleteImport.mockReset();
  mocks.deleteImport.mockResolvedValue({ error: null });
  mocks.record = {
    id: 'imp-1',
    file_name: 'statement.csv',
    status: 'pending',
    total_rows: 0,
    bank_account: null,
    bank_name: 'Bank',
    created_by_user: { id: 'u1', full_name: 'Una Uploader' },
  };
  mocks.getImport.mockImplementation(async () => ({ data: mocks.record, error: null }));
});
afterEach(() => cleanup());

describe('detail page delete', () => {
  it.each(['pending', 'failed', 'rejected'])('offers Delete for %s', async (status) => {
    mocks.record = { ...mocks.record, status };
    renderPage();
    expect(await screen.findByRole('button', { name: /Delete import/ })).toBeInTheDocument();
  });

  it.each(['processing', 'awaiting_approval', 'approved', 'completed'])(
    'hides Delete for %s',
    async (status) => {
      mocks.record = { ...mocks.record, status };
      renderPage();
      await screen.findByText('statement.csv');
      expect(deleteBtn()).not.toBeInTheDocument();
    },
  );

  it('hides Delete without imports.create', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW, PERMISSIONS.IMPORTS_APPROVE];
    renderPage();
    await screen.findByText('statement.csv');
    expect(deleteBtn()).not.toBeInTheDocument();
  });

  it('requires confirmation, then deletes and returns to the history list', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Delete import/ }));
    expect(mocks.deleteImport).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(mocks.deleteImport).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Delete import/ }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteImport).toHaveBeenCalledWith('imp-1'));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/payments/imports'));
  });

  it('stays on the page when the server refuses', async () => {
    mocks.deleteImport.mockResolvedValue({ error: 'Can only delete pending, failed, or rejected imports' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Delete import/ }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteImport).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
