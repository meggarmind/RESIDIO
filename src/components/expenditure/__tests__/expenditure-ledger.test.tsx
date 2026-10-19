// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  updateExpenseStatus: vi.fn(),
  getActiveResidents: vi.fn(),
  getStaff: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => '/expenditure',
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));
vi.mock('@/actions/expenses/update-expense', () => ({
  updateExpenseStatus: (...a: unknown[]) => mocks.updateExpenseStatus(...a),
}));
vi.mock('@/actions/residents/get-residents', () => ({
  getActiveResidents: (...a: unknown[]) => mocks.getActiveResidents(...a),
}));
vi.mock('@/actions/settings/get-staff', () => ({ getStaff: (...a: unknown[]) => mocks.getStaff(...a) }));
vi.mock('@/actions/finance/petty-cash', () => ({}));
// Render the dropdown menu content inline so its items are clickable.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
}));

import { ExpenditureClient } from '@/components/expenditure/expenditure-client';
import { ExpenditurePageClient } from '@/components/expenditure/expenditure-page-client';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PENDING = {
  id: 'exp-1',
  expense_date: '2026-10-01',
  description: 'Generator diesel',
  amount: 45000,
  status: 'pending',
  category: { name: 'Fuel' },
  vendor: { name: 'Total' },
};
const FILTERS = { page: 1, pageSize: 20 };

function renderLedger(overrides: Partial<React.ComponentProps<typeof ExpenditureClient>> = {}) {
  return render(
    <ExpenditureClient
      expenses={[PENDING]}
      count={1}
      total={45000}
      error={null}
      filters={FILTERS}
      categories={[{ id: 'cat-1', name: 'Fuel' }]}
      canManage={mocks.permissions.includes(PERMISSIONS.EXPENDITURE_MANAGE)}
      {...overrides}
    />
  );
}

function renderPage() {
  const ledger = { data: [PENDING], count: 1, total: 45000, error: null };
  return render(
    <ExpenditurePageClient
      ledger={ledger}
      pending={ledger}
      filters={FILTERS}
      vendors={[]}
      categories={[]}
      projects={[]}
      pettyCashMetrics={null}
      pettyCashAccounts={[]}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = [PERMISSIONS.EXPENDITURE_VIEW, PERMISSIONS.EXPENDITURE_MANAGE];
});
afterEach(() => cleanup());

describe('expenditure write controls are gated on EXPENDITURE_MANAGE (#785)', () => {
  it('a view-only user sees the ledger but no Log Expense, petty cash menu or row actions', () => {
    mocks.permissions = [PERMISSIONS.EXPENDITURE_VIEW];
    renderPage();

    expect(screen.getByText('Generator diesel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log Expense/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Snap/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Petty cash/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Top up')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage accounts')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel Expense')).not.toBeInTheDocument();
  });

  it('a manager gets one Log Expense action, the petty cash menu and the row actions', () => {
    renderPage();

    expect(screen.getAllByRole('button', { name: /Log Expense/ })).toHaveLength(1);
    expect(screen.getByText('Top up')).toBeInTheDocument();
    expect(screen.getByText('Manage accounts')).toBeInTheDocument();
    expect(screen.getByText('Mark as Paid')).toBeInTheDocument();
    expect(screen.getByText('Cancel Expense')).toBeInTheDocument();
  });

  it('does not load residents or staff until the log dialog opens', async () => {
    mocks.getActiveResidents.mockResolvedValue({ data: [], error: null });
    mocks.getStaff.mockResolvedValue([]);
    renderPage();

    expect(mocks.getActiveResidents).not.toHaveBeenCalled();
    expect(mocks.getStaff).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Log Expense/ }));

    await waitFor(() => expect(mocks.getActiveResidents).toHaveBeenCalledTimes(1));
    expect(mocks.getStaff).toHaveBeenCalledTimes(1);
  });
});

describe('Cancel Expense needs confirmation (#785)', () => {
  it('opens a confirm and changes nothing until confirmed', () => {
    renderLedger();

    fireEvent.click(screen.getByText('Cancel Expense'));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Cancel this expense?');
    expect(mocks.updateExpenseStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.updateExpenseStatus).not.toHaveBeenCalled();
  });

  it('sends one request when confirm is double-clicked', async () => {
    let resolve!: (value: { error: null }) => void;
    mocks.updateExpenseStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderLedger();

    fireEvent.click(screen.getByText('Cancel Expense'));
    const confirm = screen.getByRole('button', { name: 'Mark cancelled' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await act(async () => resolve({ error: null }));
    expect(mocks.updateExpenseStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateExpenseStatus).toHaveBeenCalledWith('exp-1', 'cancelled');
  });

  it('Mark as Paid sends one request on a double-click', async () => {
    let resolve!: (value: { error: null }) => void;
    mocks.updateExpenseStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    renderLedger();

    fireEvent.click(screen.getByText('Mark as Paid'));
    fireEvent.click(screen.getByText('Mark as Paid'));

    await act(async () => resolve({ error: null }));
    expect(mocks.updateExpenseStatus).toHaveBeenCalledTimes(1);
    expect(mocks.updateExpenseStatus).toHaveBeenCalledWith('exp-1', 'paid');
  });

  it('shows the error the action returns rather than a generic one', async () => {
    mocks.updateExpenseStatus.mockResolvedValue({ error: 'Unauthorized' });
    renderLedger();

    fireEvent.click(screen.getByText('Mark as Paid'));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Unauthorized'));
  });
});

describe('ledger filters, totals and errors (#785)', () => {
  it('shows the total of every matching expense, not just this page', () => {
    renderLedger({ count: 120, total: 1234567.5, filters: { ...FILTERS, status: 'pending' } });

    expect(screen.getByText(/Total \(filtered\), 120 expenses/)).toBeInTheDocument();
    expect(screen.getByText(/1,234,567\.50/)).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 6')).toBeInTheDocument();
  });

  it('puts a status change in the URL and returns to page 1', () => {
    renderLedger({ filters: { page: 3, pageSize: 20 } });

    fireEvent.click(screen.getByRole('radio', { name: 'Pending' }));

    expect(mocks.push).toHaveBeenCalledWith('/expenditure?status=pending');
  });

  it('a debounced search keeps a filter chosen while typing', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderLedger();
      fireEvent.change(screen.getByLabelText('Search expenses'), { target: { value: 'diesel' } });
      rerender(
        <ExpenditureClient
          expenses={[PENDING]}
          count={1}
          total={45000}
          error={null}
          filters={{ ...FILTERS, status: 'pending' }}
          categories={[]}
          canManage
        />
      );

      act(() => vi.advanceTimersByTime(400));

      expect(mocks.push).toHaveBeenLastCalledWith('/expenditure?status=pending&q=diesel');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a debounced search keeps a filter chosen while the navigation is still in flight', () => {
    vi.useFakeTimers();
    try {
      renderLedger();
      fireEvent.change(screen.getByLabelText('Search expenses'), { target: { value: 'diesel' } });
      fireEvent.click(screen.getByRole('radio', { name: 'Pending' }));

      act(() => vi.advanceTimersByTime(400));

      expect(mocks.push).toHaveBeenLastCalledWith('/expenditure?status=pending&q=diesel');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pages through the URL', () => {
    renderLedger({ count: 45 });

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(mocks.push).toHaveBeenCalledWith('/expenditure?page=2');
  });

  it('labels the search and category controls', () => {
    renderLedger();

    expect(screen.getByRole('combobox', { name: 'Filter by category' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search expenses')).toBeInTheDocument();
  });

  it('shows an error state when the ledger read failed', () => {
    renderLedger({ expenses: [], count: 0, total: 0, error: 'Failed to fetch expenses' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load expenses');
  });
});
