// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  role: 'chairman',
  getAwaitingVerification: vi.fn(),
  processSingleTransaction: vi.fn(),
  skipTransaction: vi.fn(),
  manuallyVerifyPayment: vi.fn(),
  deletePayment: vi.fn(),
  getActiveResidents: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    profile: { role_name: mocks.role },
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('@/actions/payments/awaiting-verification', () => ({
  getAwaitingVerification: (...a: unknown[]) => mocks.getAwaitingVerification(...a),
}));
vi.mock('@/actions/email-imports/process-email-import', () => ({
  processSingleTransaction: (...a: unknown[]) => mocks.processSingleTransaction(...a),
  skipTransaction: (...a: unknown[]) => mocks.skipTransaction(...a),
}));
vi.mock('@/actions/finance/manual-verification', () => ({
  manuallyVerifyPayment: (...a: unknown[]) => mocks.manuallyVerifyPayment(...a),
}));
vi.mock('@/actions/payments/delete-payment', () => ({
  deletePayment: (...a: unknown[]) => mocks.deletePayment(...a),
}));
vi.mock('@/actions/residents/get-residents', () => ({
  getActiveResidents: (...a: unknown[]) => mocks.getActiveResidents(...a),
}));
// Radix Select does not open in jsdom: render a native select instead.
vi.mock('@/components/ui/select', () => {
  const Select = ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">-</option>
      {children}
    </select>
  );
  return {
    Select,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

import AwaitingVerificationPage from '@/app/(dashboard)/payments/awaiting-verification/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const ALERT = {
  id: 'tx-1',
  email_import_id: 'imp-1',
  amount: 5000,
  transaction_type: 'credit',
  transaction_date: '2026-11-02',
  created_at: '2026-11-02T10:00:00Z',
  description: 'NIP TRANSFER FROM JOHN DOE',
  bank_account_last4: '1234',
  senderVerified: true,
};
const RECEIPT = {
  id: 'pay-1',
  amount: 2000,
  payment_date: '2026-11-01',
  created_at: '2026-11-01T09:00:00Z',
  notes: null,
  houseCode: 'A1',
  resident: 'Ada Obi',
};
const BOTH = {
  alerts: [ALERT],
  alertsError: null,
  receipts: [RECEIPT],
  receiptsError: null,
  autoProcessLimit: 60000,
};
const ALL_PERMS = [
  PERMISSIONS.EMAIL_IMPORTS_PROCESS,
  PERMISSIONS.PAYMENTS_VERIFY,
  PERMISSIONS.PAYMENTS_DELETE,
  PERMISSIONS.EMAIL_IMPORTS_VIEW,
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AwaitingVerificationPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.permissions = ALL_PERMS;
  mocks.role = 'chairman';
  mocks.getAwaitingVerification.mockReset().mockResolvedValue(BOTH);
  mocks.processSingleTransaction.mockReset().mockResolvedValue({ success: true });
  mocks.skipTransaction.mockReset().mockResolvedValue({ success: true });
  mocks.manuallyVerifyPayment.mockReset().mockResolvedValue({ success: true });
  mocks.deletePayment.mockReset().mockResolvedValue({ success: true });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.getActiveResidents.mockReset().mockResolvedValue({
    data: [{ id: 'res-1', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-001' }],
    error: null,
  });
});
afterEach(cleanup);

describe('awaiting verification page: actions', () => {
  it('approves an alert with the chosen resident and the payer name as alias by default', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const select = await screen.findByRole('combobox');
    await screen.findByRole('option', { name: /Ada Obi/ });
    fireEvent.change(select, { target: { value: 'res-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));
    await waitFor(() => expect(mocks.processSingleTransaction).toHaveBeenCalledTimes(1));
    const [id, opts] = mocks.processSingleTransaction.mock.calls[0];
    expect(id).toBe('tx-1');
    expect(opts).toMatchObject({ residentId: 'res-1', saveAsAlias: true });
    expect(opts.aliasName).toBeTruthy();
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    // The list is fetched again after the action.
    await waitFor(() => expect(mocks.getAwaitingVerification.mock.calls.length).toBeGreaterThan(1));
  });

  it('does not save an alias when the box is cleared', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByRole('option', { name: /Ada Obi/ });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'res-1' } });
    fireEvent.click(screen.getByLabelText('Save payer name as alias'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }));
    await waitFor(() => expect(mocks.processSingleTransaction).toHaveBeenCalled());
    expect(mocks.processSingleTransaction.mock.calls[0][1]).toMatchObject({
      residentId: 'res-1',
      saveAsAlias: false,
      aliasName: undefined,
    });
  });

  it('skips an alert with the chosen reason', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    const confirm = screen.getByRole('button', { name: 'Confirm skip' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Duplicate alert' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.skipTransaction).toHaveBeenCalledWith('tx-1', 'Duplicate alert'));
  });

  it('verifies a receipt with the optional note', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify' }));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'seen in statement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm verify' }));
    await waitFor(() => expect(mocks.manuallyVerifyPayment).toHaveBeenCalledWith('pay-1', 'seen in statement'));
  });

  it('rejects a receipt only after the confirm text, then deletes it', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(mocks.deletePayment).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'The app removes this payment and opens the bills it paid again. Use this only when the money never came.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(mocks.deletePayment).toHaveBeenCalledWith('pay-1'));
  });

  it('shows the reason and keeps the row when an action fails', async () => {
    mocks.deletePayment.mockResolvedValue({ success: false, error: 'Locked' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Locked'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe('awaiting verification page: over-limit rule', () => {
  const BIG = { ...ALERT, amount: 900000 };

  it('disables Approve and shows the reason without imports.approve', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({ ...BOTH, alerts: [BIG], receipts: [] });
    renderPage();
    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/Needs approval: over/)).toBeInTheDocument();
  });

  it('enables Approve with imports.approve', async () => {
    mocks.permissions = [...ALL_PERMS, PERMISSIONS.IMPORTS_APPROVE];
    mocks.getAwaitingVerification.mockResolvedValue({ ...BOTH, alerts: [BIG], receipts: [] });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('treats an unreadable limit as over the limit', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({ ...BOTH, autoProcessLimit: null, receipts: [] });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
  });
});

describe('awaiting verification page: visibility follows access', () => {
  it('hides Approve and Skip without email_imports.process', async () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VERIFY, PERMISSIONS.PAYMENTS_DELETE];
    mocks.getAwaitingVerification.mockResolvedValue({
      ...BOTH,
      alerts: null,
      alertsError: 'no permission',
    });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(screen.getByText(/Bank alerts are hidden/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
  });

  it('hides Verify and Reject without their permissions and says why', async () => {
    mocks.permissions = [PERMISSIONS.EMAIL_IMPORTS_PROCESS];
    mocks.getAwaitingVerification.mockResolvedValue({
      ...BOTH,
      receipts: null,
      receiptsError: 'no permission',
    });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.getByText(/Receipts are hidden/)).toBeInTheDocument();
  });

  it('shows Verify but not Reject without payments.delete', async () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VERIFY];
    renderPage();
    expect(await screen.findByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('shows an error with the reason, not an empty list, when a load fails', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({
      alerts: null,
      alertsError: 'alerts boom',
      receipts: null,
      receiptsError: 'receipts boom',
      autoProcessLimit: null,
    });
    renderPage();
    expect(await screen.findByText(/alerts boom/)).toBeInTheDocument();
    expect(screen.getByText(/receipts boom/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing is waiting for verification.')).not.toBeInTheDocument();
  });
});

describe('awaiting verification page: cards and dates', () => {
  it('filters one table by the cards and uses month names', async () => {
    renderPage();
    expect(await screen.findByText('2 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('1 Nov 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Receipts, no bank proof/ }));
    expect(screen.queryByText('NIP TRANSFER FROM JOHN DOE')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Bank alerts, no resident/ }));
    expect(screen.getByText('NIP TRANSFER FROM JOHN DOE')).toBeInTheDocument();
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument();
  });
});
