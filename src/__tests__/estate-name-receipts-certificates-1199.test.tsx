// @vitest-environment jsdom
//
// #1199: the admin payment receipt and the move-out certificates take the estate name and address
// from Settings instead of the component default "Residio Estate".
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  settings: [] as { key: string; value: unknown }[],
}));

vi.mock('@/hooks/use-settings', () => ({
  useGeneralSettings: () => ({ data: mocks.settings, isLoading: false }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock('@/hooks/use-payments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-payments')>()),
  useUnverifyPayment: () => ({ mutate: vi.fn(), isPending: false }),
  usePayment: () => ({
    isLoading: false,
    error: null,
    data: {
      id: 'pay-12345678',
      reference_number: 'REF-1',
      amount: 5000,
      method: 'cash',
      status: 'paid',
      payment_date: '2026-10-01',
      resident: { first_name: 'Ada', last_name: 'Obi' },
    },
  }),
}));

import { useEstateDetails } from '@/hooks/use-estate-details';
import { PaymentReceipt } from '@/components/payments/payment-receipt';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

// React's use() reads a thenable marked fulfilled synchronously, so the page renders without suspending.
const resolved = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value }) as Promise<T>;

beforeEach(() => {
  mocks.settings = [];
});
afterEach(cleanup);

describe('useEstateDetails', () => {
  it('returns the trimmed Settings name and address', () => {
    mocks.settings = [
      { key: 'estate_name', value: '  Palm Grove Estate ' },
      { key: 'estate_address', value: '1 Palm Road, Lagos' },
    ];
    const { result } = renderHook(() => useEstateDetails());
    expect(result.current).toEqual({ estateName: 'Palm Grove Estate', estateAddress: '1 Palm Road, Lagos' });
  });

  it('returns undefined for blank or missing values so component defaults apply', () => {
    mocks.settings = [{ key: 'estate_name', value: '   ' }];
    const { result } = renderHook(() => useEstateDetails());
    expect(result.current).toEqual({ estateName: undefined, estateAddress: undefined });
  });
});

describe('callers pass the Settings values', () => {
  it('payments/[id] page prints the Settings estate name on the receipt', async () => {
    mocks.settings = [{ key: 'estate_name', value: 'Palm Grove Estate' }];
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
    const { default: Page } = await import('@/app/(dashboard)/payments/[id]/page');
    render(
      <React.Suspense fallback={null}>
        <Page params={resolved({ id: 'pay-12345678' })} />
      </React.Suspense>,
      { wrapper }
    );
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /receipt/i }), { button: 0 });
    await waitFor(() => expect(screen.getByText('Palm Grove Estate')).toBeInTheDocument());
    expect(screen.queryByText('Residio Estate')).not.toBeInTheDocument();
  }, 30000);

  it('PaymentReceipt keeps "Residio Estate" when no name is passed', () => {
    render(<PaymentReceipt payment={{ id: 'p1', amount: 1, payment_date: '2026-10-01' } as never} />);
    expect(screen.getByText('Residio Estate')).toBeInTheDocument();
  });
});

// The wizards and the wallet tools only reach these props after a multi-step flow, so the
// wiring is pinned at source level: dropping a prop at a caller fails here.
describe('caller wiring', () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8');

  it.each([
    ['src/components/residents/move-out-wizard.tsx', 'certificate'],
    ['src/components/residents/owner-move-out-wizard.tsx', 'pdfCertificate'],
  ])('%s passes the Settings name and address to the certificate PDF', (file, cert) => {
    const src = read(file);
    expect(src).toContain('const { estateName, estateAddress } = useEstateDetails();');
    expect(src).toContain(`<ClearanceCertificatePDF certificate={${cert}} estateName={estateName} estateAddress={estateAddress} />`);
  });

  it('the wallet payment tools pass the Settings name to the receipt', () => {
    const src = read('src/components/residents/wallet-payment-batch-tools.tsx');
    expect(src).toContain('const { estateName } = useEstateDetails();');
    expect(src).toContain('<PaymentReceipt payment={receipt} estateName={estateName} />');
  });
});
