// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletTransactions } from '@/components/residents/wallet-transactions';

const mocks = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock('@/hooks/use-wallet', () => ({
  useYearlyWalletTransactions: () => ({ data: mocks.data, isLoading: false }),
}));
vi.mock('@/actions/billing/get-invoices', () => ({ getInvoiceById: vi.fn() }));

afterEach(cleanup);

const year = (n: number) => ({
  year: 2026,
  opening_balance: 0,
  closing_balance: 0,
  transactions: Array.from({ length: n }, (_, i) => ({
    id: `t${i}`, type: 'debit', created_at: '2026-10-25T00:00:00Z', amount: 5000, balance_after: 0,
    description: `Wallet allocation ${i}`, reference_type: null, reference_id: null,
  })),
});

const renderIt = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <WalletTransactions residentId="r1" />
  </QueryClientProvider>,
);

describe('Wallet transaction history scrolls inside its card (#1166)', () => {
  it('wraps the table in a height-capped vertical scroll area', () => {
    mocks.data = [year(75)];
    renderIt();
    const box = screen.getByTestId('wallet-transactions-scroll');
    expect(box.className).toMatch(/max-h-\[/);
    expect(box.className).toContain('overflow-y-auto');
    // every row of the open year is still rendered inside the scroll area
    expect(box.textContent).toContain('Wallet allocation 74');
  });
});
