// @vitest-environment jsdom
//
// #1199: the move-out wizards and the wallet payment tools hand the Settings estate name and
// address to the certificate PDF and the receipt instead of letting them fall back to the default.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  settings: [] as { key: string; value: unknown }[],
  pdfElements: [] as { props: Record<string, unknown> }[],
}));

vi.mock('@/hooks/use-settings', () => ({
  useGeneralSettings: () => ({ data: mocks.settings, isLoading: false }),
}));
vi.mock('@react-pdf/renderer', () => ({
  pdf: (element: { props: Record<string, unknown> }) => {
    mocks.pdfElements.push(element);
    return { toBlob: () => Promise.resolve(new Blob()) };
  },
}));
vi.mock('@/lib/pdf/clearance-certificate', () => ({ ClearanceCertificatePDF: () => null }));
vi.mock('@/components/payments/payment-receipt', () => ({
  PaymentReceipt: ({ estateName }: { estateName?: string }) => <div data-testid="receipt">{estateName ?? 'default'}</div>,
}));

const certificate = {
  id: 'c1', residentId: 'r1', residentName: 'Ada Obi', residentCode: 'R-1', houseId: 'h1', houseAddress: '1 Palm Road',
  clearanceDate: '2026-10-01', validUntil: '2026-10-08', validityDays: 7, destination: 'leaving_estate', destinationHouse: null,
  newRole: 'non_resident_owner', certificateNumber: 'CC-1', status: 'pending_confirmation', createdBy: 'u1',
  createdAt: '2026-10-01', secondaryResidentsRemoved: 0,
};
const clearance = { canProceed: true, walletBalance: 0, totalUnpaid: 0, netBalance: 0, unpaidInvoiceCount: 0, message: 'ok' };

vi.mock('@/actions/residents/move-out-renter', () => ({
  checkRenterClearance: () => Promise.resolve({ data: clearance, error: null }),
  getAvailableHousesForMoveIn: () => Promise.resolve({ data: [], error: null }),
  initiateRenterMoveOut: () => Promise.resolve({ error: null, certificate }),
}));
vi.mock('@/actions/residents/move-out-owner', () => ({
  checkOwnerClearance: () => Promise.resolve({ data: clearance, error: null }),
  initiateOwnerMoveOut: () => Promise.resolve({ error: null, certificate }),
}));
vi.mock('@/actions/billing/wallet', () => ({
  getOrCreateWallet: () => Promise.resolve({ data: { id: 'w1', resident_id: 'r1', balance: 10000 }, error: null }),
}));
vi.mock('@/actions/billing/settle-wallet-invoices', () => ({
  getResidentPayableInvoices: () => Promise.resolve({
    data: [{ id: 'inv-1', invoice_number: 'INV-0001', house_id: 'h1', amount_due: 5000, amount_paid: 0, status: 'pending', period_start: '2026-01-01', period_end: '2026-01-31' }],
    error: null,
  }),
  settleWalletInvoices: () => Promise.resolve({ success: true, receiptNumber: 'RC-1', batchId: 'b1', fullyPaidCount: 1, partialCount: 0, totalAllocated: 5000 }),
}));
vi.mock('@/actions/billing/prepay-future-invoices', () => ({ prepayFutureInvoices: vi.fn() }));
vi.mock('@/actions/billing/get-wallet-payment-batch', () => ({
  getWalletPaymentBatch: () => Promise.resolve({ data: { id: 'b1', amount: 5000, payment_date: '2026-10-01' }, error: null }),
  getWalletPaymentBatches: () => Promise.resolve({ data: [], error: null }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

import { MoveOutWizard } from '@/components/residents/move-out-wizard';
import { OwnerMoveOutWizard } from '@/components/residents/owner-move-out-wizard';
import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  URL.createObjectURL ??= () => 'blob:x';
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  mocks.pdfElements = [];
  mocks.settings = [
    { key: 'estate_name', value: 'Palm Grove Estate' },
    { key: 'estate_address', value: '1 Palm Road, Lagos' },
  ];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const expectCertificateProps = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /download certificate/i }));
  await waitFor(() => expect(mocks.pdfElements).toHaveLength(1));
  expect(mocks.pdfElements[0].props).toMatchObject({ estateName: 'Palm Grove Estate', estateAddress: '1 Palm Road, Lagos' });
};

describe('callers pass the Settings estate details (#1199)', () => {
  it('MoveOutWizard certificate PDF', async () => {
    wrap(<MoveOutWizard open onOpenChange={vi.fn()} residentId="r1" residentName="Ada Obi" houseId="h1" houseAddress="1 Palm Road" />);
    fireEvent.click(await screen.findByRole('button', { name: /^next$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /generate certificate/i }));
    await expectCertificateProps();
  });

  it('OwnerMoveOutWizard certificate PDF', async () => {
    wrap(<OwnerMoveOutWizard open onOpenChange={vi.fn()} residentId="r1" residentName="Ada Obi" houseId="h1" houseAddress="1 Palm Road" />);
    fireEvent.click(await screen.findByRole('button', { name: /complete move-out/i }));
    await expectCertificateProps();
  });

  it('WalletPaymentBatchTools receipt', async () => {
    wrap(<WalletPaymentBatchTools residentId="r1" houses={[]} section="settle" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /select all invoices/i }));
    fireEvent.click(screen.getByRole('button', { name: /settle selected/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm settlement/i }));
    await waitFor(() => expect(screen.getByTestId('receipt')).toHaveTextContent('Palm Grove Estate'));
  });
});
