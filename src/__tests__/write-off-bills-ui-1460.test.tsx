// @vitest-environment jsdom
//
// #1460: the "Write off bills" rail button is gated on billing.write_off_invoices, and the dialog
// selects bills (by hand and with the smart buttons), shows the totals, and sends the reason and note.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { WriteOffBillsDialogContent } from '@/components/residents/write-off-bills-dialog-content';
import { getWriteOffCandidates, writeOffInvoices } from '@/actions/billing/write-off-invoices';

vi.mock('@/actions/billing/write-off-invoices', () => ({
  getWriteOffCandidates: vi.fn(),
  writeOffInvoices: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const bill = (id: string, month: string, due: number, paid = 0) => ({
  id,
  invoice_number: `INV-${id}`,
  house_id: 'h1',
  house_label: 'IBB-36',
  charge_category: 'dues',
  period_start: `${month}-01`,
  amount_due: due,
  amount_paid: paid,
  status: paid > 0 ? 'partially_paid' : 'unpaid',
});
const BILLS = [bill('a', '2020-07', 5000), bill('b', '2020-08', 5000, 2000), bill('c', '2021-01', 5000), bill('d', '2025-01', 10000)];

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WriteOffBillsDialogContent residentId={RESIDENT} residentName="Alhaji Shakiru" />
    </QueryClientProvider>
  );
}
const bar = () => screen.getByText(/bills selected/).closest('p') as HTMLElement;

describe('Write off bills dialog (#1460)', () => {
  it('shows the refusal reason when the bills cannot be loaded, never an empty list', async () => {
    vi.mocked(getWriteOffCandidates).mockResolvedValue({ data: null, error: 'Permission denied' });
    renderDialog();
    expect(await screen.findByText(/Could not load the open bills: Permission denied/)).toBeInTheDocument();
    expect(screen.queryByText(/bills selected/)).toBeNull();
  });

  it('groups bills by year with month names and selects with select-all, a year button and Clear', async () => {
    vi.mocked(getWriteOffCandidates).mockResolvedValue({ data: BILLS as never, error: null });
    renderDialog();
    expect(await screen.findByText('Jul 2020')).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '2020' })).toHaveLength(1);
    expect(screen.getByText(/part paid/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all bills' }));
    // 5,000 + 3,000 (part-paid balance) + 5,000 + 10,000
    expect(bar()).toHaveTextContent(/4 bills selected · ₦23,000\.00 · owed after: ₦0\.00/);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(bar()).toHaveTextContent(/0 bills selected/);
    expect(screen.getByRole('button', { name: 'Write off selected' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '2020' }));
    expect(bar()).toHaveTextContent(/2 bills selected · ₦8,000\.00 · owed after: ₦15,000\.00/);
  });

  it('picks the oldest bills up to an agreed amount and says when it is not exact', async () => {
    vi.mocked(getWriteOffCandidates).mockResolvedValue({ data: BILLS as never, error: null });
    renderDialog();
    await screen.findByText('Jul 2020');
    fireEvent.change(screen.getByLabelText('Agreed write-off ₦'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Oldest bills up to this amount' }));
    expect(screen.getByRole('status')).toHaveTextContent(/No exact match\. The 2 oldest bills make ₦8,000\.00\. The difference is ₦1,000\.00\./);
    expect(bar()).toHaveTextContent(/2 bills selected/);
  });

  it('keeps the newest bills a payment covers', async () => {
    vi.mocked(getWriteOffCandidates).mockResolvedValue({ data: BILLS as never, error: null });
    renderDialog();
    await screen.findByText('Jul 2020');
    fireEvent.change(screen.getByLabelText('Payment ₦'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep newest bills for this payment' }));
    // 15,000 pays Jan 2025 (10,000) and Jan 2021 (5,000); the two 2020 bills are selected.
    expect(bar()).toHaveTextContent(/2 bills selected · ₦8,000\.00 · owed after: ₦0\.00/);
  });

  it('needs a note of 5 characters, then sends the bills, reason and note', async () => {
    vi.mocked(getWriteOffCandidates).mockResolvedValue({ data: BILLS as never, error: null });
    vi.mocked(writeOffInvoices).mockResolvedValue({ success: true, error: null, batchId: 'batch', count: 2, total: 8000 });
    renderDialog();
    await screen.findByText('Jul 2020');
    fireEvent.click(screen.getByRole('button', { name: '2020' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write off selected' }));

    const confirm = await screen.findByRole('button', { name: 'Write off 2 bills' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Exco settlement 4 Nov 2026' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(writeOffInvoices).toHaveBeenCalledTimes(1));
    expect(writeOffInvoices).toHaveBeenCalledWith({
      residentId: RESIDENT,
      invoiceIds: ['a', 'b'],
      reason: 'exco_settlement',
      note: 'Exco settlement 4 Nov 2026',
    });
  });
});
