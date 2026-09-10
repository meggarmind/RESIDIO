// @vitest-environment jsdom
//
// Issue #120 QA follow-up: `WalletPaymentBatchTools` (mounted on the
// Transactions tab alongside `WalletBalance`) held the wallet balance in a
// local `useState`, populated by a direct, one-shot server-action call. The
// `useCreditWallet` / `useDebitWallet` mutations in src/hooks/use-wallet.ts
// invalidate the `['wallet', residentId]` React Query key on success -- a
// key this component never subscribed to, so its balance (and the
// `walletBalance === 0` settle-disabled guard) went stale after an
// adjustment until an unrelated refetch happened to occur.
//
// The fix replaces the local state with the shared `useWallet(residentId)`
// hook. This test proves the component now reads from that shared cache: it
// invalidates the exact query key the credit/debit mutations invalidate and
// asserts the on-screen balance -- and the zero-balance settle guard --
// update with no local refetch and no page reload.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';

const RESIDENT_ID = 'r1';

const mocks = vi.hoisted(() => ({
  getOrCreateWallet: vi.fn(),
  INVOICE: {
    id: 'inv-1',
    invoice_number: 'INV-0001',
    house_id: 'house-1',
    amount_due: 20000,
    amount_paid: 0,
    status: 'pending',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
  },
}));
const getOrCreateWallet = mocks.getOrCreateWallet;

vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: (...args: unknown[]) => mocks.getOrCreateWallet(...args),
}));

vi.mock('@/actions/billing/settle-wallet-invoices', () => ({
  getResidentPayableInvoices: vi.fn().mockResolvedValue({ data: [mocks.INVOICE], error: null }),
  settleWalletInvoices: vi.fn(),
}));

vi.mock('@/actions/billing/prepay-future-invoices', () => ({
  prepayFutureInvoices: vi.fn(),
}));

vi.mock('@/actions/billing/get-wallet-payment-batch', () => ({
  getWalletPaymentBatch: vi.fn(),
  getWalletPaymentBatches: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

beforeAll(() => {
  // Radix AlertDialog probes these in jsdom.
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

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WalletPaymentBatchTools residentId={RESIDENT_ID} houses={[]} />
    </QueryClientProvider>
  );
  return queryClient;
}

/** Select the one loaded invoice and open the settle confirmation dialog. */
async function openSettleDialog() {
  await waitFor(() => {
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('checkbox'));

  const trigger = await screen.findByRole('button', { name: /settle selected/i });
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.click(trigger);

  await waitFor(() => {
    expect(screen.getByText('Settle selected invoices?')).toBeInTheDocument();
  });
}

describe('WalletPaymentBatchTools reads the wallet balance from the shared query (#120)', () => {
  it('updates the settle dialog balance after the wallet query is invalidated, with no reload', async () => {
    getOrCreateWallet.mockResolvedValueOnce({
      data: { id: 'w1', resident_id: RESIDENT_ID, balance: 0 },
      error: null,
    });

    const queryClient = renderWithClient();
    await openSettleDialog();

    // Starting balance is zero: both the displayed figure and the guard text
    // that disables settlement must reflect it.
    expect(screen.getByText('Available wallet balance')).toBeInTheDocument();
    expect(screen.getByText('₦0.00')).toBeInTheDocument();
    expect(screen.getByText(/wallet balance is zero/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm settlement/i })).toBeDisabled();

    // Simulate a successful credit elsewhere on the page: useCreditWallet's
    // onSuccess invalidates exactly this query key (src/hooks/use-wallet.ts).
    getOrCreateWallet.mockResolvedValueOnce({
      data: { id: 'w1', resident_id: RESIDENT_ID, balance: 50000 },
      error: null,
    });
    queryClient.invalidateQueries({ queryKey: ['wallet', RESIDENT_ID] });

    // No page reload and no local refetch were triggered -- only the shared
    // query resolving again should move the displayed balance.
    await waitFor(() => {
      expect(screen.getByText('₦50,000.00')).toBeInTheDocument();
    });
    expect(screen.queryByText(/wallet balance is zero/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm settlement/i })).not.toBeDisabled();

    // getOrCreateWallet was called for the initial load and once more after
    // invalidation -- never by a local one-shot fetch inside the component.
    expect(getOrCreateWallet).toHaveBeenCalledTimes(2);
    expect(getOrCreateWallet).toHaveBeenCalledWith(RESIDENT_ID);
  });
});

describe('WalletPaymentBatchTools no longer owns a local wallet-balance fetch (#120)', () => {
  it('does not import getResidentWalletBalance', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/residents/wallet-payment-batch-tools.tsx'),
      'utf8'
    );
    expect(source).not.toMatch(/getResidentWalletBalance/);
    expect(source).toMatch(/useWallet\(residentId\)/);
  });
});
