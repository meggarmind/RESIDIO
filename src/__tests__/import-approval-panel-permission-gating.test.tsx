// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  record: {} as Record<string, unknown>,
  getImport: vi.fn(),
  getImportRowSummary: vi.fn(),
  submitForApproval: vi.fn(),
  approveImport: vi.fn(),
  rejectImport: vi.fn(),
  processImport: vi.fn(),
  resetFailedImport: vi.fn(),
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
  submitForApproval: (...a: unknown[]) => mocks.submitForApproval(...a),
  approveImport: (...a: unknown[]) => mocks.approveImport(...a),
  rejectImport: (...a: unknown[]) => mocks.rejectImport(...a),
  processImport: (...a: unknown[]) => mocks.processImport(...a),
  resetFailedImport: (...a: unknown[]) => mocks.resetFailedImport(...a),
}));
vi.mock('@/actions/imports/bank-accounts', () => ({}));
vi.mock('@/actions/residents/aliases', () => ({}));

// Radix unmounts closed dialog content; render it always so the reject form is observable.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    <div data-testid="dialog" data-open={String(open)}>
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

import { ImportApprovalPanel } from '@/components/imports/import-approval-panel';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const BASE = {
  id: 'imp-1',
  file_name: 'statement.csv',
  created_rows: 0,
  skipped_rows: 0,
  error_rows: 0,
  import_summary: null,
  created_by_user: { id: 'u1', full_name: 'Una Uploader', email: 'u@x.test' },
  approved_by_user: null,
};

function setStatus(status: string, extra: Record<string, unknown> = {}) {
  mocks.record = { ...BASE, status, ...extra };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <ImportApprovalPanel importId="imp-1" />
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, rerenderPanel: () => result.rerender(tree()) };
}

const btn = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => {
  mocks.permissions = [];
  mocks.push.mockReset();
  mocks.submitForApproval.mockClear();
  setStatus('processing');
  mocks.getImport.mockImplementation(async () => ({ data: mocks.record, error: null }));
  mocks.getImportRowSummary.mockResolvedValue({
    data: { total: 5, matched: 3, unmatched: 1, duplicate: 1 },
    error: null,
  });
  mocks.submitForApproval.mockResolvedValue({ error: null });
  mocks.resetFailedImport.mockReset();
  mocks.resetFailedImport.mockResolvedValue({ createdRows: 2, error: null });
  mocks.approveImport.mockResolvedValue({ error: null });
  mocks.rejectImport.mockResolvedValue({ error: null });
  mocks.processImport.mockResolvedValue({
    success: true,
    import_id: 'imp-1',
    created_count: 3,
    skipped_count: 2,
    error_count: 0,
    errors: [],
  });
});
afterEach(() => cleanup());

describe('processing status', () => {
  it('shows Submit for approval only to holders of imports.review', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_APPROVE];
    renderPanel();
    await screen.findByText(/has not been submitted yet/);
    expect(btn('Submit for approval')).not.toBeInTheDocument();
  });

  it('submits through submitForApproval for a reviewer', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(mocks.submitForApproval).toHaveBeenCalledWith('imp-1'));
  });

  it('disables Submit and explains why when there are no matched rows (#666)', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    mocks.getImportRowSummary.mockResolvedValue({
      data: { total: 2, matched: 0, unmatched: 2, duplicate: 0 },
      error: null,
    });
    renderPanel();
    expect(
      await screen.findByText('No matched rows to process, so there is nothing to submit.'),
    ).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit for approval' });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(mocks.submitForApproval).not.toHaveBeenCalled();
  });

  it('enables Submit and shows no explanation when matched rows exist (#666)', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    renderPanel();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeEnabled(),
    );
    expect(screen.queryByText(/nothing to submit/)).not.toBeInTheDocument();
  });

  it('surfaces a server error string', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    mocks.submitForApproval.mockResolvedValue({ error: 'Import is not in processing status' });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByText('Import is not in processing status')).toBeInTheDocument();
  });

  it('disables and hides the button once the permission is revoked', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    const { rerenderPanel } = renderPanel();
    expect(await screen.findByRole('button', { name: 'Submit for approval' })).toBeEnabled();
    mocks.permissions = [];
    rerenderPanel();
    expect(btn('Submit for approval')).not.toBeInTheDocument();
  });
});

describe('awaiting_approval status', () => {
  beforeEach(() => setStatus('awaiting_approval'));

  it('gates Approve and Reject independently', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_APPROVE];
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(btn('Reject')).not.toBeInTheDocument();
    expect(btn('Confirm rejection')).not.toBeInTheDocument();
  });

  it('shows Reject without Approve for a reject-only user', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REJECT];
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(btn('Approve')).not.toBeInTheDocument();
  });

  it('shows neither to a reviewer-only user, and never offers Process', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    renderPanel();
    await screen.findByText(/Waiting for approval/);
    expect(btn('Approve')).not.toBeInTheDocument();
    expect(btn('Reject')).not.toBeInTheDocument();
    expect(btn('Process payments')).not.toBeInTheDocument();
  });

  it('approves with the import id', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_APPROVE];
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mocks.approveImport).toHaveBeenCalledWith('imp-1', undefined));
  });

  it('shows a server error such as a self-approval refusal', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_APPROVE];
    mocks.approveImport.mockResolvedValue({ error: 'You cannot approve your own submission' });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('You cannot approve your own submission')).toBeInTheDocument();
  });

  it('cannot confirm a rejection with an empty or whitespace reason', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REJECT];
    renderPanel();
    const confirm = await screen.findByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '   ' } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.rejectImport).not.toHaveBeenCalled();
  });

  it('passes the trimmed reason to rejectImport', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REJECT];
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Reason'), {
      target: { value: '  Wrong account  ' },
    });
    const confirm = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.rejectImport).toHaveBeenCalledWith('imp-1', 'Wrong account'));
  });
});

describe('approved status', () => {
  beforeEach(() => setStatus('approved', { approved_by_user: { id: 'u2', full_name: 'Ada Approver', email: 'a@x.test' } }));

  it('shows Process payments to holders of imports.review and names the approver', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Process payments' })).toBeEnabled();
    expect(screen.getByText(/Approved by Ada Approver/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Una Uploader/)).toBeInTheDocument();
  });

  it('hides Process from an approve-only user', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_APPROVE, PERMISSIONS.IMPORTS_REJECT];
    renderPanel();
    await screen.findByText(/Choose the processing options/);
    expect(btn('Process payments')).not.toBeInTheDocument();
  });

  it('processes with the chosen options', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Process payments' }));
    await waitFor(() =>
      expect(mocks.processImport).toHaveBeenCalledWith({
        import_id: 'imp-1',
        mode: 'individual',
        skip_duplicates: true,
        skip_unmatched: true,
      }),
    );
    expect(await screen.findByText('Payments Created')).toBeInTheDocument();
  });

  it('removes Process when the permission is revoked', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_REVIEW];
    const { rerenderPanel } = renderPanel();
    await screen.findByRole('button', { name: 'Process payments' });
    mocks.permissions = [];
    rerenderPanel();
    expect(btn('Process payments')).not.toBeInTheDocument();
  });
});

describe('other statuses render no action buttons', () => {
  const ALL = [
    PERMISSIONS.IMPORTS_REVIEW,
    PERMISSIONS.IMPORTS_APPROVE,
    PERMISSIONS.IMPORTS_REJECT,
  ];

  it('shows the rejection reason for a rejected import', async () => {
    setStatus('rejected', { import_summary: { rejection_reason: 'Wrong account' } });
    mocks.permissions = ALL;
    renderPanel();
    expect(await screen.findByText('Wrong account')).toBeInTheDocument();
    for (const name of ['Submit for approval', 'Approve', 'Reject', 'Process payments']) {
      expect(btn(name)).not.toBeInTheDocument();
    }
  });

  it('shows the result counts for a completed import and offers no Process', async () => {
    setStatus('completed', { created_rows: 7, skipped_rows: 2, error_rows: 0 });
    mocks.permissions = ALL;
    renderPanel();
    expect(await screen.findByText('Payments created')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(btn('Process payments')).not.toBeInTheDocument();
    expect(btn('Approve')).not.toBeInTheDocument();
  });

  it('shows the counts for a failed import', async () => {
    setStatus('failed', { error_rows: 4 });
    mocks.permissions = ALL;
    renderPanel();
    expect(await screen.findByText('Errors')).toBeInTheDocument();
    expect(btn('Process payments')).not.toBeInTheDocument();
  });
});

describe('failed status reset (#708)', () => {
  beforeEach(() => {
    setStatus('failed', { error_rows: 1 });
    mocks.getImportRowSummary.mockResolvedValue({
      data: { total: 5, matched: 2, unmatched: 0, duplicate: 0, created: 3 },
      error: null,
    });
  });

  it('hides Reset from users without imports.reset', async () => {
    mocks.permissions = [
      PERMISSIONS.IMPORTS_REVIEW,
      PERMISSIONS.IMPORTS_APPROVE,
      PERMISSIONS.IMPORTS_REJECT,
    ];
    renderPanel();
    await screen.findByText('Errors');
    expect(btn('Reset for review')).not.toBeInTheDocument();
    expect(btn('Confirm reset')).not.toBeInTheDocument();
  });

  it('confirms with the created row count and resets with the import id', async () => {
    mocks.permissions = [PERMISSIONS.IMPORTS_RESET];
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Reset for review' }));
    expect(await screen.findByText(/3 rows were already created/)).toBeInTheDocument();
    expect(mocks.resetFailedImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await waitFor(() => expect(mocks.resetFailedImport).toHaveBeenCalledWith('imp-1'));
  });

  it('never offers Reset on a non-failed import', async () => {
    setStatus('completed', { created_rows: 7 });
    mocks.permissions = [PERMISSIONS.IMPORTS_RESET];
    renderPanel();
    await screen.findByText('Payments created');
    expect(btn('Reset for review')).not.toBeInTheDocument();
  });
});
