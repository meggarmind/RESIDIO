// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  push: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/use-payments', () => ({
  useDeletePayment: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

import { DeletePaymentButton } from '@/components/payments/delete-payment-button';
import { PERMISSIONS } from '@/lib/auth/action-roles';

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.PAYMENTS_DELETE];
  mocks.push.mockReset();
  mocks.mutateAsync.mockReset().mockResolvedValue({});
});
afterEach(() => cleanup());

describe('DeletePaymentButton', () => {
  it('is hidden without payments.delete', () => {
    mocks.permissions = [];
    render(<DeletePaymentButton paymentId="p1" residentId="r1" />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows the button with payments.delete', () => {
    render(<DeletePaymentButton paymentId="p1" residentId="r1" />);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('does not delete until confirmed, and not when cancelled', () => {
    render(<DeletePaymentButton paymentId="p1" residentId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('deletes on confirm and returns to the resident page', async () => {
    render(<DeletePaymentButton paymentId="p1" residentId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete payment/i }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/residents/r1'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith('p1');
  });

  it('returns to the Payments list when there is no resident', async () => {
    render(<DeletePaymentButton paymentId="p1" residentId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete payment/i }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/payments'));
  });

  it('stays on the page when the delete fails', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('nope'));
    render(<DeletePaymentButton paymentId="p1" residentId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete payment/i }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalled());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
