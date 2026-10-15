// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  imports: [] as Array<Record<string, unknown>>,
  getImports: vi.fn(),
  deleteImport: vi.fn(),
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
  getImports: (...a: unknown[]) => mocks.getImports(...a),
  deleteImport: (...a: unknown[]) => mocks.deleteImport(...a),
}));
vi.mock('@/actions/imports/bank-accounts', () => ({
  getBankAccounts: async () => ({ data: [], error: null }),
}));
vi.mock('@/actions/residents/aliases', () => ({}));

// Radix opens its menu on pointerdown inside a portal; render the items inline so the
// click path (and React's bubbling to the row) is exercised directly.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ImportHistoryTable } from '@/components/imports/import-history-table';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const row = (id: string, status: string) => ({
  id,
  file_name: `${id}.csv`,
  file_type: 'csv',
  bank_name: 'Bank',
  status,
  total_rows: 0,
  created_rows: 0,
  skipped_rows: 0,
  created_at: '2026-10-01T00:00:00Z',
  import_summary: null,
});

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ImportHistoryTable />
    </QueryClientProvider>,
  );
}

const tableRow = (id: string) => screen.getByText(`${id}.csv`).closest('tr') as HTMLElement;

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.IMPORTS_CREATE];
  mocks.push.mockReset();
  mocks.deleteImport.mockReset();
  mocks.deleteImport.mockResolvedValue({ error: null });
  mocks.imports = [
    row('pending', 'pending'),
    row('failed', 'failed'),
    row('rejected', 'rejected'),
    row('processing', 'processing'),
    row('awaiting', 'awaiting_approval'),
    row('approved', 'approved'),
    row('completed', 'completed'),
  ];
  mocks.getImports.mockImplementation(async () => ({
    data: mocks.imports,
    count: mocks.imports.length,
    error: null,
  }));
});
afterEach(() => cleanup());

describe('row navigation', () => {
  it('navigates to the detail page when a row is clicked', async () => {
    renderTable();
    await screen.findByText('approved.csv');
    fireEvent.click(tableRow('approved'));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/payments/import/approved');
  });

  it('is keyboard reachable and opens on Enter', async () => {
    renderTable();
    await screen.findByText('approved.csv');
    const r = tableRow('approved');
    expect(r).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(r, { key: 'Enter' });
    expect(mocks.push).toHaveBeenCalledWith('/payments/import/approved');
  });

  it('does not navigate when a menu item is clicked, but View Details still does so once', async () => {
    renderTable();
    await screen.findByText('approved.csv');
    const view = tableRow('approved').querySelector('[role="menuitem"]') as HTMLElement;
    fireEvent.click(view);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when the actions button is clicked or keyed', async () => {
    renderTable();
    await screen.findByText('approved.csv');
    const btn = tableRow('approved').querySelector('button[aria-label="Open actions menu"]') as HTMLElement;
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not navigate when Delete is chosen from the menu', async () => {
    renderTable();
    await screen.findByText('failed.csv');
    const del = Array.from(tableRow('failed').querySelectorAll('[role="menuitem"]')).find((e) =>
      /Delete/.test(e.textContent ?? ''),
    ) as HTMLElement;
    fireEvent.click(del);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('delete menu item', () => {
  const hasDelete = (id: string) =>
    Array.from(tableRow(id).querySelectorAll('[role="menuitem"]')).some((e) =>
      /Delete/.test(e.textContent ?? ''),
    );

  it('is offered for pending, failed and rejected only', async () => {
    renderTable();
    await screen.findByText('approved.csv');
    for (const id of ['pending', 'failed', 'rejected']) expect(hasDelete(id)).toBe(true);
    for (const id of ['processing', 'awaiting', 'approved', 'completed']) {
      expect(hasDelete(id)).toBe(false);
    }
  });

  it('is hidden without imports.create', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW, PERMISSIONS.IMPORTS_APPROVE];
    renderTable();
    await screen.findByText('pending.csv');
    for (const id of ['pending', 'failed', 'rejected']) expect(hasDelete(id)).toBe(false);
  });

  it('requires confirmation: cancel does not delete, confirm does', async () => {
    renderTable();
    await screen.findByText('pending.csv');
    const del = Array.from(tableRow('pending').querySelectorAll('[role="menuitem"]')).find((e) =>
      /Delete/.test(e.textContent ?? ''),
    ) as HTMLElement;
    fireEvent.click(del);

    expect(mocks.deleteImport).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(mocks.deleteImport).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    fireEvent.click(del);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('pending.csv');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteImport).toHaveBeenCalledWith('pending'));
    expect(mocks.deleteImport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
