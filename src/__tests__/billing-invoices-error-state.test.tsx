// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/** Issue #1153: a failed invoice read must not read as "No invoices found". */

const state = vi.hoisted(() => ({
  invoices: {} as Record<string, unknown>,
  refetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/actions/billing/get-invoices', () => ({
  getBillingResidentFilterOptions: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('@/hooks/use-billing', () => ({
  useAdminInvoices: () => state.invoices,
  useInvoiceSummary: () => ({ data: undefined, isLoading: false }),
  useOverdueStats: () => ({ data: undefined }),
  useCheckOverdueInvoices: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/auth/can', () => ({ Can: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/dashboard/enhanced-stat-card', () => ({
  EnhancedPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  EnhancedTableCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EnhancedStatCard: () => null,
}));

import BillingPage from '@/app/(dashboard)/billing/page';

afterEach(() => {
  cleanup();
  state.refetch.mockReset();
});

describe('billing invoices list', () => {
  it('shows a retry block, not the empty message, when the read fails', () => {
    state.invoices = { data: undefined, isLoading: false, isError: true, refetch: state.refetch };
    render(<BillingPage />);

    expect(screen.getByText('The invoice list could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText(/No invoices found/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the empty message for a successful empty result', () => {
    state.invoices = { data: { data: [], total: 0 }, isLoading: false, isError: false, refetch: state.refetch };
    render(<BillingPage />);

    expect(screen.getAllByText(/No invoices found/).length).toBeGreaterThan(0);
    expect(screen.queryByText('The invoice list could not be loaded')).not.toBeInTheDocument();
  });
});
