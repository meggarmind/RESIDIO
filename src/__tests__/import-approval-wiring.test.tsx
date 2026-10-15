// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  getImport: vi.fn(),
  getImportRowSummary: vi.fn(),
  getImports: vi.fn(),
  getBankAccounts: vi.fn(),
  submitForApproval: vi.fn(),
  approveImport: vi.fn(),
  rejectImport: vi.fn(),
  processImport: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/actions/imports', () => ({
  getImport: (...a: unknown[]) => mocks.getImport(...a),
  getImportRowSummary: (...a: unknown[]) => mocks.getImportRowSummary(...a),
  getImports: (...a: unknown[]) => mocks.getImports(...a),
  submitForApproval: (...a: unknown[]) => mocks.submitForApproval(...a),
  approveImport: (...a: unknown[]) => mocks.approveImport(...a),
  rejectImport: (...a: unknown[]) => mocks.rejectImport(...a),
  processImport: (...a: unknown[]) => mocks.processImport(...a),
}));
vi.mock('@/actions/imports/bank-accounts', () => ({
  getBankAccounts: (...a: unknown[]) => mocks.getBankAccounts(...a),
}));
vi.mock('@/actions/residents/aliases', () => ({}));
// Render the dropdown menu content inline so View Details is clickable.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { ImportConfirmation } from '@/components/imports/import-confirmation';
import ImportHistoryPage from '@/app/(dashboard)/payments/imports/page';
import { ImportHistoryTable } from '@/components/imports/import-history-table';
import {
  useApproveImport,
  useRejectImport,
  useSubmitForApproval,
} from '@/hooks/use-imports';
import { PERMISSIONS } from '@/lib/auth/action-roles';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.permissions = [];
  mocks.getImport.mockResolvedValue({
    data: { id: 'imp-1', file_name: 'statement.csv', file_type: 'csv', bank_name: 'GTB', transaction_filter: 'credit' },
    error: null,
  });
  mocks.getImportRowSummary.mockResolvedValue({
    data: { total: 5, matched: 3, unmatched: 1, duplicate: 1 },
    error: null,
  });
  mocks.getImports.mockResolvedValue({
    data: [
      {
        id: 'imp-9',
        file_name: 'march.csv',
        file_type: 'csv',
        bank_name: 'GTB',
        status: 'awaiting_approval',
        total_rows: 4,
        created_rows: 0,
        skipped_rows: 0,
        created_at: '2026-10-01T10:00:00Z',
        import_summary: null,
      },
    ],
    count: 1,
  });
  mocks.getBankAccounts.mockResolvedValue({ data: [], error: null });
  mocks.submitForApproval.mockResolvedValue({ error: null });
  mocks.approveImport.mockResolvedValue({ error: null });
  mocks.rejectImport.mockResolvedValue({ error: null });
});
afterEach(() => cleanup());

describe('ImportConfirmation (wizard last step)', () => {
  function renderConfirmation(onSubmitted = vi.fn()) {
    render(
      <QueryClientProvider client={makeClient()}>
        <ImportConfirmation importId="imp-1" onSubmitted={onSubmitted} onBack={vi.fn()} />
      </QueryClientProvider>,
    );
    return onSubmitted;
  }

  it('submits for approval and never processes', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    const onSubmitted = renderConfirmation();
    fireEvent.click(await screen.findByRole('button', { name: /Submit for approval/ }));
    await waitFor(() => expect(mocks.submitForApproval).toHaveBeenCalledWith('imp-1'));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('imp-1'));
    expect(mocks.processImport).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Process/ })).not.toBeInTheDocument();
  });

  it('disables the submit button with a reason when imports.review is missing', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_CREATE];
    renderConfirmation();
    const button = await screen.findByRole('button', { name: /Submit for approval/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(/imports\.review permission/)).toBeInTheDocument();
  });

  it('does not call onSubmitted when the server refuses', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    mocks.submitForApproval.mockResolvedValue({ error: 'Unauthorized' });
    const onSubmitted = renderConfirmation();
    fireEvent.click(await screen.findByRole('button', { name: /Submit for approval/ }));
    await waitFor(() => expect(mocks.submitForApproval).toHaveBeenCalled());
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

describe('ImportHistoryTable', () => {
  it('View Details hands the import id to onViewDetails', async () => {
    const onViewDetails = vi.fn();
    render(
      <QueryClientProvider client={makeClient()}>
        <ImportHistoryTable onViewDetails={onViewDetails} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /View Details/ }));
    expect(onViewDetails).toHaveBeenCalledWith('imp-9');
  });

  it('Needs approval quick filter queries awaiting_approval and toggles off', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <ImportHistoryTable />
      </QueryClientProvider>,
    );
    const quick = await screen.findByRole('button', { name: /Needs approval/ });
    fireEvent.click(quick);
    await waitFor(() =>
      expect(mocks.getImports).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_approval' }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Needs approval/ }));
    await waitFor(() =>
      expect(mocks.getImports).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined }),
      ),
    );
  });
});

describe('import history page', () => {
  it('View Details navigates to the import detail route', async () => {
    mocks.push.mockReset();
    render(
      <QueryClientProvider client={makeClient()}>
        <ImportHistoryPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /View Details/ }));
    expect(mocks.push).toHaveBeenCalledWith('/payments/import/imp-9');
  });
});

describe('approval hooks invalidate the single-import query', () => {
  async function invalidatedKeys(run: (client: QueryClient) => Promise<void>) {
    const client = makeClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await run(client);
    return spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey));
  }

  it('useSubmitForApproval', async () => {
    const keys = await invalidatedKeys(async (client) => {
      const { result } = renderHook(() => useSubmitForApproval(), { wrapper: wrapperFor(client) });
      await result.current.mutateAsync('imp-1');
    });
    expect(keys).toContain(JSON.stringify(['import', 'imp-1']));
    expect(keys).toContain(JSON.stringify(['import-stats']));
    expect(keys).toContain(JSON.stringify(['imports']));
  });

  it('useApproveImport', async () => {
    const keys = await invalidatedKeys(async (client) => {
      const { result } = renderHook(() => useApproveImport(), { wrapper: wrapperFor(client) });
      await result.current.mutateAsync({ importId: 'imp-1' });
    });
    expect(keys).toContain(JSON.stringify(['import', 'imp-1']));
  });

  it('useRejectImport', async () => {
    const keys = await invalidatedKeys(async (client) => {
      const { result } = renderHook(() => useRejectImport(), { wrapper: wrapperFor(client) });
      await result.current.mutateAsync({ importId: 'imp-1', reason: 'bad' });
    });
    expect(keys).toContain(JSON.stringify(['import', 'imp-1']));
  });
});

describe('route permission', () => {
  it('lets every import permission holder reach /payments/import and its children', async () => {
    const { ROUTE_PERMISSIONS } = await import('@/lib/auth/action-roles');
    expect(ROUTE_PERMISSIONS['/payments/import']).toEqual(
      expect.arrayContaining([
        PERMISSIONS.IMPORTS_CREATE,
        PERMISSIONS.IMPORTS_REVIEW,
        PERMISSIONS.IMPORTS_APPROVE,
        PERMISSIONS.IMPORTS_REJECT,
      ]),
    );
    // /payments/import/[id] and /payments/imports resolve by longest startsWith,
    // so no separate entry is needed (and none may narrow the permission).
    expect(ROUTE_PERMISSIONS['/payments/imports']).toBeUndefined();
  });
});
