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
  categories: { data: undefined as unknown, isError: false, error: null as Error | null },
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
vi.mock('@/hooks/use-billing', () => ({ useChargeCategories: () => mocks.categories }));
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
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';

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
  reference_number: 'REF-9',
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

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function renderPage() {
  return render(
    <QueryClientProvider client={client}>
      <AwaitingVerificationPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  client.clear();
  mocks.permissions = ALL_PERMS;
  mocks.role = 'chairman';
  mocks.getAwaitingVerification.mockReset().mockResolvedValue(BOTH);
  mocks.processSingleTransaction.mockReset().mockResolvedValue({ success: true });
  mocks.skipTransaction.mockReset().mockResolvedValue({ success: true });
  mocks.manuallyVerifyPayment.mockReset().mockResolvedValue({ success: true });
  mocks.deletePayment.mockReset().mockResolvedValue({ success: true });
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.categories = {
    data: [
      { code: 'dues', name: 'Dues', sort_order: 1 },
      { code: 'toll_gate_levy', name: 'Toll Gate Levy', sort_order: 4 },
      { code: 'other', name: 'Other', sort_order: 99 },
    ],
    isError: false,
    error: null,
  };
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
    await screen.findByRole('option', { name: /Ada Obi/ });
    const select = screen.getAllByRole('combobox')[0];
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
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'res-1' } });
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

describe('awaiting verification page: lines editor (#1443)', () => {
  async function openApprove() {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await screen.findByRole('option', { name: /Ada Obi/ });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'res-1' } });
  }
  const confirm = () => screen.getByRole('button', { name: 'Confirm approve' });

  it('starts with one dues line for the whole amount, so Approve is enabled', async () => {
    await openApprove();
    expect(screen.getByLabelText('Amount 1')).toHaveValue('5000');
    expect(screen.getByText(/All of .*5,000.* is placed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeDisabled();
    expect(confirm()).toBeEnabled();
  });

  it('blocks Approve while the lines do not add up and shows what is left', async () => {
    await openApprove();
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '3000' } });
    expect(screen.getByText(/Left to place: .*2,000/)).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getByLabelText('Amount 2')).toHaveValue('2000');
    expect(confirm()).toBeEnabled();
  });

  it('asks for a comment on an Other line', async () => {
    await openApprove();
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'other' } });
    expect(confirm()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Comment 2'), { target: { value: 'gate repair' } });
    expect(confirm()).toBeEnabled();
  });

  it('sends the lines to processSingleTransaction', async () => {
    await openApprove();
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '4000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'toll_gate_levy' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Comment 2'), { target: { value: ' gate repair ' } });
    fireEvent.click(confirm());
    await waitFor(() => expect(mocks.processSingleTransaction).toHaveBeenCalledTimes(1));
    expect(mocks.processSingleTransaction.mock.calls[0][1].lines).toEqual([
      { chargeCategory: 'toll_gate_levy', amount: 4000 },
      { chargeCategory: 'other', amount: 1000, comment: 'gate repair' },
    ]);
  });

  it('shows an error and blocks Approve when the categories do not load', async () => {
    mocks.categories = { data: undefined, isError: true, error: new Error('categories boom') };
    await openApprove();
    expect(screen.getByText(/Failed to load charge categories: categories boom/)).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
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

  it('says whether the bank email was checked, so Approve records it verified or not (#1428)', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({
      ...BOTH,
      alerts: [ALERT, { ...ALERT, id: 'tx-2', description: 'FORWARDED ALERT', senderVerified: null }],
    });
    renderPage();
    expect(await screen.findByText(/Bank email checked: Approve records it verified/)).toBeInTheDocument();
    expect(screen.getByText(/Bank email not checked: Approve records it unverified/)).toBeInTheDocument();
  });
});

describe('awaiting verification page: pinned behaviour (#1432 QA)', () => {
  it('guards the route with either permission', () => {
    expect(ROUTE_PERMISSIONS['/payments/awaiting-verification']).toEqual([
      PERMISSIONS.EMAIL_IMPORTS_PROCESS,
      PERMISSIONS.PAYMENTS_VERIFY,
    ]);
  });

  it('keeps Confirm approve disabled until a resident is chosen', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const confirm = screen.getByRole('button', { name: 'Confirm approve' });
    expect(confirm).toBeDisabled();
    await screen.findByRole('option', { name: /Ada Obi/ });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'res-1' } });
    expect(confirm).toBeEnabled();
  });

  it('disables the row buttons while an action runs', async () => {
    mocks.deletePayment.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled());
    for (const name of ['Approve', 'Skip', 'Reject']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('invalidates the email-imports queries after a successful action', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['email-imports'] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['awaiting-verification'] });
    spy.mockRestore();
  });

  it('shows the reference number in the receipt row only when there is one', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({
      ...BOTH,
      alerts: [],
      receipts: [RECEIPT, { ...RECEIPT, id: 'pay-2', reference_number: null, resident: 'Bola Eze' }],
    });
    renderPage();
    expect(await screen.findByText('REF-9')).toHaveClass('font-mono');
    expect(screen.getAllByText('REF-9')).toHaveLength(1);
  });

  it('never says nothing is waiting when a half failed, and shows a dash, not 0', async () => {
    mocks.getAwaitingVerification.mockResolvedValue({
      ...BOTH,
      alerts: null,
      alertsError: 'alerts boom',
      receipts: [],
    });
    renderPage();
    expect(await screen.findByText(/alerts boom/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing is waiting for verification.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bank alerts, no resident/ })).toHaveTextContent('—');
    expect(screen.getByRole('button', { name: /Bank alerts, no resident/ })).not.toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('—');
    expect(screen.getByRole('button', { name: /Receipts, no bank proof/ })).toHaveTextContent('0');
  });

  it('skips with a typed reason when Other is chosen, and requires the text', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Other' } });
    const confirm = screen.getByRole('button', { name: 'Confirm skip' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Other reason'), { target: { value: '  Paid in cash  ' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.skipTransaction).toHaveBeenCalledWith('tx-1', 'Paid in cash'));
  });
});
