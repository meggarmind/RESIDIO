// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
  matched_resident_id: null,
  residents: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmailImportDetailPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.permissions = [];
  mocks.getEmailImport.mockResolvedValue({ data: IMPORT_ROW, error: null });
  mocks.getReviewQueue.mockResolvedValue({ data: [QUEUED_TX], count: 1, error: null });
  mocks.getActiveResidents.mockResolvedValue({ data: [], error: null });
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
    renderPage();

    expect(await screen.findByText('No transactions found in this status')).toBeInTheDocument();
    expect(screen.queryByText(/Rows per page/)).not.toBeInTheDocument();
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
