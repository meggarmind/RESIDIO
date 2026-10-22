// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  bulkVerify: vi.fn(async () => ({ success: true })),
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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-payments', () => ({
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkUpdatePayments: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkVerifyPayments: () => ({ mutateAsync: mocks.bulkVerify, isPending: false }),
  usePayments: () => ({ data: { data: [], count: 0 }, isLoading: false }),
  usePaymentStats: () => ({ data: undefined, isLoading: false }),
  usePayment: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock('@/components/payments/payment-receipt', () => ({ PaymentReceipt: () => null }));
vi.mock('@/components/payments/email-receipt-dialog', () => ({ EmailReceiptDialog: () => null }));

vi.mock('@/components/payments/payment-filters', () => ({
  PaymentFilters: () => null,
}));

import { PaymentTable } from '@/components/payments/payment-table';
import PaymentsPage from '@/app/(dashboard)/payments/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PAYMENT = {
  id: 'pay-1',
  amount: 5000,
  method: 'cash',
  status: 'paid',
  payment_date: '2026-01-15',
  reference_number: 'REF-1',
  resident: { first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1' },
} as never;

beforeEach(() => {
  mocks.permissions = [];
  mocks.bulkVerify.mockClear();
});
afterEach(() => cleanup());

describe('Payments permission gating (issue #462)', () => {
  it('hides Record Payment from a payments.view-only user', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    render(<PaymentsPage />);
    expect(screen.queryByText(/Record Payment/)).not.toBeInTheDocument();
  });

  it('shows Record Payment to a user holding payments.create', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_CREATE];
    render(<PaymentsPage />);
    expect(screen.getByText(/Record Payment/)).toBeInTheDocument();
  });

  it('hides the row delete button from a view-only user but keeps the row', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    render(<PaymentTable data={[PAYMENT]} />);
    expect(screen.getByText('REF-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete payment' })).not.toBeInTheDocument();
  });

  it('shows the row delete button to a user holding payments.delete', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_DELETE];
    render(<PaymentTable data={[PAYMENT]} />);
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Delete payment' })).toBeInTheDocument();
    expect(within(screen.getByTestId('payment-card-list')).getByRole('button', { name: 'Delete payment' })).toBeInTheDocument();
  });

  it('hides bulk Update Status and Delete Selected from a view-only user, keeps Export', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    render(<PaymentTable data={[PAYMENT]} />);
    fireEvent.click(screen.getByLabelText('Select all'));

    expect(screen.getByText(/1 payment selected/)).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.queryByText('Update Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete Selected')).not.toBeInTheDocument();
  });

  it('shows bulk Update Status and Delete Selected to a user holding the write permissions', () => {
    mocks.permissions = [
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.PAYMENTS_BULK_UPDATE,
      PERMISSIONS.PAYMENTS_DELETE,
    ];
    render(<PaymentTable data={[PAYMENT]} />);
    fireEvent.click(screen.getByLabelText('Select all'));

    expect(screen.getByText('Update Status')).toBeInTheDocument();
    expect(screen.getByText('Delete Selected')).toBeInTheDocument();
  });

  it('hides bulk Mark Verified from a user holding payments.bulk_update but not payments.verify', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_BULK_UPDATE];
    render(<PaymentTable data={[PAYMENT]} />);
    fireEvent.click(screen.getByLabelText('Select all'));

    expect(screen.getByText('Update Status')).toBeInTheDocument();
    expect(screen.queryByText('Mark Verified')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mark selected payments verified')).not.toBeInTheDocument();
  });

  it('shows bulk Mark Verified at both breakpoints to a payments.verify holder and confirms with the count (#812)', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_VERIFY];
    const second = { ...(PAYMENT as object), id: 'pay-2', reference_number: 'REF-2' } as never;
    render(<PaymentTable data={[PAYMENT, second]} />);
    fireEvent.click(screen.getByLabelText('Select all'));

    expect(screen.getByLabelText('Mark selected payments verified')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark Verified'));

    expect(screen.getByText(/Mark 2 payments as verified\?/)).toBeInTheDocument();
    expect(mocks.bulkVerify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Verify 2' }));
    expect(mocks.bulkVerify).toHaveBeenCalledWith({ ids: ['pay-1', 'pay-2'] });
  });

  it('hides the empty-state Add Payment from a view-only user', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    render(<PaymentTable data={[]} />);
    expect(screen.getByText('No payments found')).toBeInTheDocument();
    expect(screen.queryByText('Add Payment')).not.toBeInTheDocument();
  });

  it('shows the empty-state Add Payment to a user holding payments.create', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_CREATE];
    render(<PaymentTable data={[]} />);
    expect(screen.getByText('Add Payment')).toBeInTheDocument();
  });
});
