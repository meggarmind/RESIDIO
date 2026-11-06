// @vitest-environment jsdom
/** #1455: View receipt shows only to users who can get the signed URL; others see one line saying why. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => mocks.permissions.includes(p) }),
}));
vi.mock('@/actions/payments/get-payment-proof-url', () => ({ getPaymentProofUrl: vi.fn() }));

import { ViewReceiptButton } from '@/components/payments/view-receipt-button';
import { PERMISSIONS } from '@/lib/auth/action-roles';

afterEach(() => cleanup());

describe('ViewReceiptButton', () => {
  it('shows View receipt to a payments.update holder', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_UPDATE];
    render(<ViewReceiptButton paymentId="payment-1" />);
    expect(screen.getByRole('button', { name: /view receipt/i })).toBeInTheDocument();
  });

  it('shows no button, only why, to a user who can see the payment but not its receipt', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.APPROVALS_VIEW];
    render(<ViewReceiptButton paymentId="payment-1" />);
    expect(screen.queryByRole('button', { name: /view receipt/i })).not.toBeInTheDocument();
    expect(screen.getByText(/needs the payments update permission/i)).toBeInTheDocument();
  });
});
