// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  getEmailImport: vi.fn(),
  getReviewQueue: vi.fn(),
  getActiveResidents: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ importId: 'import-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/actions/email-imports/create-email-import', () => ({
  getEmailImport: (...args: unknown[]) => mocks.getEmailImport(...args),
}));
vi.mock('@/actions/email-imports/process-email-import', () => ({
  getReviewQueue: (...args: unknown[]) => mocks.getReviewQueue(...args),
  processSingleTransaction: vi.fn(),
  skipTransaction: vi.fn(),
}));
vi.mock('@/actions/residents/get-residents', () => ({
  getActiveResidents: (...args: unknown[]) => mocks.getActiveResidents(...args),
}));
vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));
// Radix unmounts closed dialog content, which hides stale state. Render the
// content always, with data-open, and let a button drive onOpenChange(false)
// (what Escape / outside-click do), so close handling is observable.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="dialog" data-open={String(open)}>
      {children}
      <button aria-label="mock-escape" onClick={() => onOpenChange(false)} />
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock('@/hooks/use-gmail-connection', () => ({
  useGmailConnectionStatus: () => ({ data: undefined, isLoading: false }),
}));

import EmailImportDetailPage from '@/app/(dashboard)/payments/email-imports/[importId]/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getUnmatchedCount } from '@/lib/email-imports/utils';

const IMPORT_ROW = {
  id: 'import-1',
  created_at: '2026-10-01T10:00:00Z',
  source_email: 'bank@example.com',
  emails_fetched: 3,
  transactions_extracted: 5,
  transactions_matched: 1,
  transactions_auto_processed: 0,
  transactions_queued: 1,
  transactions_skipped: 0,
  transactions_errored: 0,
};

const QUEUED_TX = {
  id: 'tx-1',
  status: 'queued_for_review',
  description: 'NIP TRANSFER FROM JOHN DOE',
  amount: 5000,
  transaction_type: 'credit',
  transaction_date: '2026-10-01',
  match_confidence: 'low',
  matched_resident_id: 'res-1',
  residents: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A fresh element each time, so React does not bail out of the re-render.
  const tree = () => (
    <QueryClientProvider client={client}>
      <EmailImportDetailPage />
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, rerenderPage: () => result.rerender(tree()) };
}

beforeEach(() => {
  mocks.permissions = [];
  mocks.getEmailImport.mockResolvedValue({ data: IMPORT_ROW, error: null });
  mocks.getReviewQueue.mockResolvedValue({ data: [QUEUED_TX], count: 1, error: null });
  mocks.getActiveResidents.mockResolvedValue({
    data: [{ id: 'res-1', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-001' }],
    error: null,
  });
});
afterEach(() => cleanup());

describe('Email import detail permission gating (issue #564)', () => {
  it('hides Process and Skip from a user who can only view', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW];
    renderPage();

    expect(await screen.findByText('NIP TRANSFER FROM JOHN DOE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Process transaction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip transaction' })).not.toBeInTheDocument();
  });

  it('shows Process and Skip to a holder of email_imports.process', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_VIEW, PERMISSIONS.EMAIL_IMPORTS_PROCESS];
    renderPage();

    expect(await screen.findByRole('button', { name: 'Process transaction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip transaction' })).toBeInTheDocument();
  });
});

describe('Email import detail dialogs (issue #564)', () => {
  // Only email_imports.process: the dialog submits must key off that permission
  // itself, not off the route's view permission.
  const PROCESS_ONLY = [PERMISSIONS.EMAIL_IMPORTS_PROCESS];
  const dialogs = () => screen.getAllByTestId('dialog');

  async function openProcessDialog() {
    fireEvent.click(await screen.findByRole('button', { name: 'Process transaction' }));
    await waitFor(() => expect(dialogs()[0]).toHaveAttribute('data-open', 'true'));
  }
  async function openSkipDialog() {
    fireEvent.click(await screen.findByRole('button', { name: 'Skip transaction' }));
    await waitFor(() => expect(dialogs()[1]).toHaveAttribute('data-open', 'true'));
    fireEvent.change(screen.getByPlaceholderText(/Duplicate, Not a payment/), {
      target: { value: 'duplicate' },
    });
  }

  it('enables the Process submit for a holder of email_imports.process, disables it once revoked', async () => {
    mocks.permissions = PROCESS_ONLY;
    const { rerenderPage } = renderPage();
    await openProcessDialog();

    expect(screen.getByRole('button', { name: 'Create Payment' })).toBeEnabled();

    mocks.permissions = [];
    rerenderPage();
    expect(screen.getByRole('button', { name: 'Create Payment' })).toBeDisabled();
  });

  it('enables the Skip submit for a holder of email_imports.process, disables it once revoked', async () => {
    mocks.permissions = PROCESS_ONLY;
    const { rerenderPage } = renderPage();
    await openSkipDialog();

    expect(screen.getByRole('button', { name: 'Skip Transaction' })).toBeEnabled();

    mocks.permissions = [];
    rerenderPage();
    expect(screen.getByRole('button', { name: 'Skip Transaction' })).toBeDisabled();
  });

  it('clears the Process dialog state when it is closed by Escape / outside click', async () => {
    mocks.permissions = PROCESS_ONLY;
    renderPage();
    await openProcessDialog();

    const process = within(dialogs()[0]);
    fireEvent.change(process.getByPlaceholderText(/Add notes about this transaction/), {
      target: { value: 'some notes' },
    });
    expect(process.getByText('NIP TRANSFER FROM JOHN DOE')).toBeInTheDocument();

    fireEvent.click(process.getByLabelText('mock-escape'));

    await waitFor(() => expect(dialogs()[0]).toHaveAttribute('data-open', 'false'));
    expect(process.getByPlaceholderText(/Add notes about this transaction/)).toHaveValue('');
    expect(process.queryByText('NIP TRANSFER FROM JOHN DOE')).not.toBeInTheDocument();
    expect(process.getByRole('button', { name: 'Create Payment' })).toBeDisabled();
  });

  it('clears the Skip dialog state when it is closed by Escape / outside click', async () => {
    mocks.permissions = PROCESS_ONLY;
    renderPage();
    await openSkipDialog();

    const skip = within(dialogs()[1]);
    expect(skip.getByText('NIP TRANSFER FROM JOHN DOE')).toBeInTheDocument();

    fireEvent.click(skip.getByLabelText('mock-escape'));

    await waitFor(() => expect(dialogs()[1]).toHaveAttribute('data-open', 'false'));
    expect(skip.getByPlaceholderText(/Duplicate, Not a payment/)).toHaveValue('');
    expect(skip.queryByText('NIP TRANSFER FROM JOHN DOE')).not.toBeInTheDocument();
  });

  it('disables the resident select and shows an alert when residents fail to load', async () => {
    mocks.permissions = PROCESS_ONLY;
    mocks.getActiveResidents.mockResolvedValue({ data: null, error: 'residents down' });
    renderPage();
    await openProcessDialog();

    expect(await screen.findByText(/Failed to load residents: residents down/)).toHaveAttribute(
      'role',
      'alert'
    );
    expect(within(dialogs()[0]).getByRole('combobox')).toBeDisabled();
  });

  it('leaves the resident select enabled when residents load', async () => {
    mocks.permissions = PROCESS_ONLY;
    renderPage();
    await openProcessDialog();

    await waitFor(() => expect(mocks.getActiveResidents).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to load residents/)).not.toBeInTheDocument();
    expect(within(dialogs()[0]).getByRole('combobox')).toBeEnabled();
  });
});

describe('Email import detail error states (issue #564)', () => {
  it('shows a failure state, not "Import not found", when the import query fails', async () => {
    mocks.getEmailImport.mockResolvedValue({ data: null, error: 'boom: db down' });
    renderPage();

    expect(await screen.findByText('Failed to load import')).toBeInTheDocument();
    expect(screen.getByText('boom: db down')).toBeInTheDocument();
    expect(screen.queryByText('Import not found')).not.toBeInTheDocument();
  });

  it('shows "Import not found" when the query succeeds with no data', async () => {
    mocks.getEmailImport.mockResolvedValue({ data: null, error: null });
    renderPage();

    expect(await screen.findByText('Import not found')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load import')).not.toBeInTheDocument();
  });

  it('shows an error, not "No transactions found", when the transactions query fails', async () => {
    mocks.getReviewQueue.mockResolvedValue({ data: [], count: 0, error: 'queue exploded' });
    renderPage();

    expect(await screen.findByText(/Failed to load transactions: queue exploded/)).toBeInTheDocument();
    expect(screen.queryByText('No transactions found in this status')).not.toBeInTheDocument();
  });

  it('does not render a bare 0 when there are no transactions', async () => {
    mocks.getReviewQueue.mockResolvedValue({ data: [], count: 0, error: null });
    const { container } = renderPage();

    expect(await screen.findByText('No transactions found in this status')).toBeInTheDocument();
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument();
    // `count && ...` with count 0 leaks a bare "0" text node into the page root.
    const root = container.firstElementChild as HTMLElement;
    const strayText = Array.from(root.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim());
    expect(strayText).not.toContain('0');
  });
});

describe('getUnmatchedCount', () => {
  it('is extracted minus matched', () => {
    expect(getUnmatchedCount({ transactions_extracted: 10, transactions_matched: 7 })).toBe(3);
  });

  it('never returns a negative number when matched exceeds extracted', () => {
    expect(getUnmatchedCount({ transactions_extracted: 2, transactions_matched: 5 })).toBe(0);
  });

  it('treats null and missing counts as zero', () => {
    expect(getUnmatchedCount({})).toBe(0);
    expect(getUnmatchedCount({ transactions_extracted: null, transactions_matched: null })).toBe(0);
    expect(getUnmatchedCount({ transactions_extracted: 4, transactions_matched: null })).toBe(4);
  });

  it('ignores the processing counters', () => {
    expect(
      getUnmatchedCount({
        transactions_extracted: 10,
        transactions_matched: 7,
        transactions_auto_processed: 5,
        transactions_queued: 4,
        transactions_skipped: 3,
        transactions_errored: 2,
      })
    ).toBe(3);
  });
});
