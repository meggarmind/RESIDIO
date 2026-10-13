// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  unverify: vi.fn<(...args: unknown[]) => Promise<{ success: boolean; error?: string }>>(async () => ({ success: true })),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('@/actions/finance/manual-verification', () => ({
  unverifyPayment: (...a: unknown[]) => mocks.unverify(...a),
}));
vi.mock('@/actions/payments/update-payment', () => ({ updatePayment: vi.fn() }));
vi.mock('@/actions/payments/get-payments', () => ({ getPayments: vi.fn() }));
vi.mock('@/actions/payments/get-payment', () => ({ getPayment: vi.fn() }));
vi.mock('@/actions/payments/create-payment', () => ({ createPayment: vi.fn() }));
vi.mock('@/actions/payments/create-split-payment', () => ({ createSplitPayment: vi.fn() }));
vi.mock('@/actions/payments/delete-payment', () => ({ deletePayment: vi.fn() }));
vi.mock('@/actions/payments/get-payment-stats', () => ({ getPaymentStats: vi.fn() }));
vi.mock('@/actions/payments/bulk-update-payments', () => ({ bulkUpdatePayments: vi.fn() }));
vi.mock('@/actions/payments/get-resident-properties-for-payment', () => ({ getResidentPropertiesForPayment: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UnverifyPaymentButton } from '@/components/payments/unverify-payment-button';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { toast } from 'sonner';

function renderButton(isVerified: boolean | null) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <UnverifyPaymentButton paymentId="p1" isVerified={isVerified} />
    </QueryClientProvider>
  );
  return invalidate;
}

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.EXPENDITURE_MANAGE];
  mocks.unverify.mockClear();
  mocks.unverify.mockResolvedValue({ success: true });
});
afterEach(() => cleanup());

describe('UnverifyPaymentButton (#502)', () => {
  it('is hidden for an unverified payment', () => {
    renderButton(false);
    expect(screen.queryByRole('button', { name: /Un-verify/ })).not.toBeInTheDocument();
  });

  it('is hidden for a user without the verify permission', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_UPDATE];
    renderButton(true);
    expect(screen.queryByRole('button', { name: /Un-verify/ })).not.toBeInTheDocument();
  });

  it('confirms, passes the reason to unverifyPayment, toasts and refreshes queries', async () => {
    const invalidate = renderButton(true);
    fireEvent.click(screen.getByRole('button', { name: /Un-verify/ }));
    expect(mocks.unverify).not.toHaveBeenCalled(); // needs confirmation first
    fireEvent.change(screen.getByPlaceholderText('Reason (optional)'), { target: { value: 'wrong amount' } });
    const confirmButtons = screen.getAllByRole('button', { name: /Un-verify/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mocks.unverify).toHaveBeenCalledWith('p1', 'wrong amount'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["payments"]', '["payment"]']));
  });

  it('shows an error toast when the action fails', async () => {
    mocks.unverify.mockResolvedValue({ success: false, error: 'nope' } as never);
    renderButton(true);
    fireEvent.click(screen.getByRole('button', { name: /Un-verify/ }));
    const confirmButtons = screen.getAllByRole('button', { name: /Un-verify/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
  });
});
