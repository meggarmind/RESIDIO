// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/actions/billing/get-invoices', () => ({
  getBillingResidentFilterOptions: async () => ({ data: [], error: null }),
}));

vi.mock('@/hooks/use-billing', () => ({
  useAdminInvoices: () => ({ data: { data: [], total: 0 }, isLoading: false, refetch: vi.fn() }),
  useInvoiceSummary: () => ({ data: undefined, isLoading: false }),
  useOverdueStats: () => ({ data: undefined }),
  useCheckOverdueInvoices: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import BillingPage from '@/app/(dashboard)/billing/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

beforeEach(() => {
  mocks.permissions = [];
});
afterEach(() => cleanup());

describe('BillingPage permission gating (issue #462)', () => {
  it('hides Generate Invoices from a billing.view-only user', () => {
    mocks.permissions = [PERMISSIONS.BILLING_VIEW];
    render(<BillingPage />);
    expect(screen.getByText('Billing & Invoices')).toBeInTheDocument();
    expect(screen.queryByText('Generate Invoices')).not.toBeInTheDocument();
  });

  it('shows Generate Invoices to a user holding billing.create_invoice', () => {
    mocks.permissions = [PERMISSIONS.BILLING_VIEW, PERMISSIONS.BILLING_CREATE_INVOICE];
    render(<BillingPage />);
    expect(screen.getByText('Generate Invoices')).toBeInTheDocument();
  });
});
