// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const updateSpy = vi.hoisted(() => vi.fn(async () => ({ success: true })));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-payments', () => ({
  useCreatePayment: () => ({ mutateAsync: vi.fn() }),
  useUpdatePayment: () => ({ mutateAsync: updateSpy }),
  useResidentPropertiesForPayment: () => ({ data: undefined, isLoading: false }),
  useRecordSplitPayment: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/use-collections', () => ({ useOpenCollections: () => ({ data: undefined }) }));
vi.mock('@/hooks/use-billing', () => ({
  useChargeCategories: () => ({ data: [{ code: 'dues', name: 'Dues', sort_order: 1 }] }),
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: () => ({ data: { data: [] }, isLoading: false }),
}));

import { PaymentForm } from '@/components/payments/payment-form';
import { findLockedFieldChanges } from '@/lib/payments/verified-lock';

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const base = {
  id: 'p1', resident_id: RESIDENT, house_id: null, amount: '5000.00', status: 'paid', method: 'cash',
  payment_date: '2026-01-15', reference_number: 'R1', notes: 'n', period_start: null, period_end: null,
};

afterEach(() => { cleanup(); updateSpy.mockClear(); });

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

  it('saving a verified payment sends the stored amount, status and resident, so the server lock does not refuse it', async () => {
    render(<PaymentForm initialData={{ ...base, is_verified: true } as never} />);
    fireEvent.change(screen.getByPlaceholderText('Additional details...'), { target: { value: 'edited note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Payment' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [{ id, data }] = updateSpy.mock.calls[0] as unknown as [{ id: string; data: Record<string, unknown> }];
    expect(id).toBe('p1');
    expect(data).toMatchObject({ amount: 5000, status: 'paid', resident_id: RESIDENT, notes: 'edited note' });
    expect(findLockedFieldChanges(true, base, data)).toEqual([]);
  });
});
