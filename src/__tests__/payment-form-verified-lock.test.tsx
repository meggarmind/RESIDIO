// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-payments', () => ({
  useCreatePayment: () => ({ mutateAsync: vi.fn() }),
  useUpdatePayment: () => ({ mutateAsync: vi.fn() }),
  useResidentPropertiesForPayment: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: () => ({ data: { data: [] }, isLoading: false }),
}));

import { PaymentForm } from '@/components/payments/payment-form';

const base = {
  id: 'p1', resident_id: 'r1', house_id: null, amount: 5000, status: 'paid', method: 'cash',
  payment_date: '2026-01-15', reference_number: 'R1', notes: 'n', period_start: null, period_end: null,
};

afterEach(() => cleanup());

describe('PaymentForm verified lock (#502)', () => {
  it('disables amount and status and explains why for a verified payment', () => {
    render(<PaymentForm initialData={{ ...base, is_verified: true } as never} />);
    expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
    expect(screen.getAllByRole('combobox')[1]).toBeDisabled(); // status
    expect(screen.getByRole('note')).toHaveTextContent(/Un-verify/);
    expect(screen.getByPlaceholderText('Bank ref, Receipt #, etc.')).toBeEnabled();
    expect(screen.getByPlaceholderText('Additional details...')).toBeEnabled();
  });

  it('keeps amount and status editable for an unverified payment', () => {
    render(<PaymentForm initialData={{ ...base, is_verified: false } as never} />);
    expect(screen.getByPlaceholderText('0.00')).toBeEnabled();
    expect(screen.getAllByRole('combobox')[1]).toBeEnabled();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
