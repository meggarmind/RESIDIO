// @vitest-environment jsdom
//
// #1158: the payable-invoice list needs a tri-state select-all and a
// "select what the wallet covers" control, both hidden from viewers.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';

const mocks = vi.hoisted(() => ({
  balance: 40000,
  canManage: true,
  invoices: [] as unknown[],
}));

const makeInvoices = (count: number, amount: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `inv-${i + 1}`,
    invoice_number: `INV-${String(i + 1).padStart(4, '0')}`,
    house_id: 'house-1',
    amount_due: amount,
    amount_paid: 0,
    status: 'pending',
    period_start: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    period_end: '2026-01-31',
  }));

vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: () => Promise.resolve({ data: { id: 'w1', resident_id: 'r1', balance: mocks.balance }, error: null }),
}));
vi.mock('@/actions/billing/settle-wallet-invoices', () => ({
  getResidentPayableInvoices: () => Promise.resolve({ data: mocks.invoices, error: null }),
  settleWalletInvoices: vi.fn(),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: () => mocks.canManage }),
}));
vi.mock('@/actions/billing/prepay-future-invoices', () => ({ prepayFutureInvoices: vi.fn() }));
vi.mock('@/actions/billing/get-wallet-payment-batch', () => ({
  getWalletPaymentBatch: vi.fn(),
  getWalletPaymentBatches: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderTools(count: number, amount: number) {
  mocks.invoices = makeInvoices(count, amount);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WalletPaymentBatchTools residentId="r1" houses={[]} section="settle" />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
}

const selectAll = () => screen.getByRole('checkbox', { name: /select all invoices/i });
const coversButton = () => screen.getByRole('button', { name: /select what the wallet covers/i });

describe('WalletPaymentBatchTools select all (#1158)', () => {
  it('selects all 75 invoices in one click, shows the total, and clears in one click', async () => {
    mocks.canManage = true;
    await renderTools(75, 5000);

    expect(screen.getByText('0 of 75 selected')).toBeInTheDocument();
    fireEvent.click(selectAll());
    expect(screen.getByText('75 of 75 selected')).toBeInTheDocument();
    expect(selectAll()).toBeChecked();
    expect(screen.getByRole('button', { name: /settle selected \(₦375,000\.00\)/i })).toBeInTheDocument();

    fireEvent.click(selectAll());
    expect(screen.getByText('0 of 75 selected')).toBeInTheDocument();
    expect(selectAll()).not.toBeChecked();
  });

  it('exposes the partial state as mixed when some are selected by hand', async () => {
    mocks.canManage = true;
    await renderTools(3, 5000);

    fireEvent.click(screen.getByRole('checkbox', { name: /INV-0001/ }));
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
    expect(selectAll()).toHaveAttribute('aria-checked', 'mixed');
    expect((selectAll() as HTMLInputElement).indeterminate).toBe(true);
  });
});

describe('WalletPaymentBatchTools select what the wallet covers (#1158)', () => {
  it('selects the 8 oldest of 5,000 invoices for a 40,000 wallet', async () => {
    mocks.canManage = true;
    mocks.balance = 40000;
    await renderTools(12, 5000);
    await waitFor(() => expect(coversButton()).toBeEnabled());

    fireEvent.click(coversButton());
    expect(screen.getByText('8 of 12 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /INV-0008/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /INV-0009/ })).not.toBeChecked();
  });

  it('includes the invoice that only partly fits', async () => {
    mocks.canManage = true;
    mocks.balance = 12000;
    await renderTools(5, 5000);
    await waitFor(() => expect(coversButton()).toBeEnabled());

    fireEvent.click(coversButton());
    expect(screen.getByText('3 of 5 selected')).toBeInTheDocument();
  });

  it('is disabled when the wallet balance is zero', async () => {
    mocks.canManage = true;
    mocks.balance = 0;
    await renderTools(3, 5000);

    expect(coversButton()).toBeDisabled();
  });
});

describe('WalletPaymentBatchTools viewer gate (#1158)', () => {
  it('shows no checkboxes or selection controls without billing.manage_wallets', async () => {
    mocks.canManage = false;
    mocks.balance = 40000;
    await renderTools(3, 5000);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/of 3 selected/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /select what the wallet covers/i })).not.toBeInTheDocument();
  });
});
