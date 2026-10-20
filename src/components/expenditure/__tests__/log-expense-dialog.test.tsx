// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  createExpense: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('@/actions/expenses/create-expense', () => ({
  createExpense: (...a: unknown[]) => mocks.createExpense(...a),
}));

import { LogExpenseDialog } from '@/components/expenditure/log-expense-dialog';

function renderDialog(onSuccess = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <LogExpenseDialog
      open
      onOpenChange={onOpenChange}
      vendors={[]}
      categories={[{ id: 'cat-1', name: 'Repairs' }] as never}
      projects={[]}
      onSuccess={onSuccess}
      initialData={{ amount: '10', category_id: 'cat-1', expense_date: '2026-10-01' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record Expense' }));
}

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LogExpenseDialog (#845)', () => {
  it('shows the returned error and keeps the dialog open', async () => {
    mocks.createExpense.mockResolvedValue({ data: null, error: 'Expense amount must be greater than zero' });
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(onSuccess, onOpenChange);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Expense amount must be greater than zero'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('passes the created expense to onSuccess', async () => {
    mocks.createExpense.mockResolvedValue({ data: { id: 'e1' }, error: null });
    const onSuccess = vi.fn();
    renderDialog(onSuccess);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 'e1' }));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
