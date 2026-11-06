// @vitest-environment jsdom
// #1406: the Budgets screen, option C. A yearly amount per category, an optional monthly split that
// starts even, a status pill, a warning that names the amount to fix, and Save blocked until the
// months add up. View-only users see amounts and no edit controls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    canManage: true,
    saveBudgetYear: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock('@/components/auth/can', () => ({ useCan: () => mocks.canManage }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('@/actions/expenses/budgets', () => ({ saveBudgetYear: mocks.saveBudgetYear }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { BudgetsClient } from '@/components/expenditure/budgets/budgets-client';
import { evenSplit } from '@/lib/budgets/budget-months';
import type { BudgetYear } from '@/actions/expenses/budgets';

const CAT_A = '11111111-1111-4111-8111-111111111111';
const CAT_B = '22222222-2222-4222-8222-222222222222';

const budget = (): BudgetYear => ({
    year: 2026,
    categories: [
        { categoryId: CAT_A, name: 'Security', color: 'blue', isActive: true, months: evenSplit(1200), yearly: 1200, hasBudget: true, actual: 1080, hasIrregularRows: false },
        { categoryId: CAT_B, name: 'Water', color: 'blue', isActive: true, months: Array(12).fill(0), yearly: 0, hasBudget: false, actual: 0, hasIrregularRows: false },
    ],
});

const renderScreen = (props: Partial<Parameters<typeof BudgetsClient>[0]> = {}) =>
    render(<BudgetsClient year={2026} currentYear={2026} budget={budget()} error={null} {...props} />);

const card = (name: string) => screen.getByRole('region', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save budgets' });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.canManage = true;
    mocks.saveBudgetYear.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('Budgets screen (#1406)', () => {
    it('shows each category with its yearly amount, % used and Even split; Save off until something changes', () => {
        renderScreen();
        const security = card('Security');
        expect(within(security).getByLabelText('Yearly budget for Security')).toHaveProperty('value', '1,200');
        expect(within(security).getByText('90.0% used (₦1,080.00 paid)')).toBeTruthy();
        expect(within(security).getByTestId('budget-split-status').textContent).toBe('Even split');
        expect(screen.getByTestId('budget-total').textContent).toBe('₦1,200.00');
        expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    });

    it('opens 12 month inputs prefilled with the even split, December taking the remainder', () => {
        renderScreen();
        const security = card('Security');
        fireEvent.change(within(security).getByLabelText('Yearly budget for Security'), { target: { value: '1000' } });
        fireEvent.click(within(security).getByRole('button', { name: 'Adjust months' }));
        expect(within(security).getByLabelText('Security January')).toHaveProperty('value', '83.33');
        expect(within(security).getByLabelText('Security December')).toHaveProperty('value', '83.37');
        expect(within(security).getByText('Months total: ₦1,000.00')).toBeTruthy();
        expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByTestId('budget-save-status').textContent).toBe('Unsaved changes');
    });

    it('a month change that keeps the total is Custom months; one that breaks it names the amount and blocks Save', () => {
        renderScreen();
        const security = card('Security');
        fireEvent.click(within(security).getByRole('button', { name: 'Adjust months' }));
        fireEvent.change(within(security).getByLabelText('Security June'), { target: { value: '150' } });
        expect(within(security).getByTestId('budget-split-status').textContent).toBe('Months do not add up');
        expect(within(security).getByTestId('budget-mismatch').textContent).toBe(
            'Months add up to ₦1,250.00. The year is ₦1,200.00. Remove ₦50.00 to match.'
        );
        expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByTestId('budget-save-status').textContent).toBe('1 category has months that do not add up. Fix them to save.');

        fireEvent.change(within(security).getByLabelText('Security July'), { target: { value: '50' } });
        expect(within(security).getByTestId('budget-split-status').textContent).toBe('Custom months');
        expect(within(security).queryByTestId('budget-mismatch')).toBeNull();
        expect((saveButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('a lower month says how much to add; Reset to even split puts the months back', () => {
        renderScreen();
        const security = card('Security');
        fireEvent.click(within(security).getByRole('button', { name: 'Adjust months' }));
        fireEvent.change(within(security).getByLabelText('Security March'), { target: { value: '40' } });
        expect(within(security).getByTestId('budget-mismatch').textContent).toMatch(/Add ₦60\.00 to match\.$/);
        fireEvent.click(within(security).getByRole('button', { name: 'Reset to even split' }));
        expect(within(security).getByTestId('budget-split-status').textContent).toBe('Even split');
        expect(within(security).getByLabelText('Security March')).toHaveProperty('value', '100');
    });

    it('custom months stay when the year changes, so the pill shows they do not add up', () => {
        renderScreen();
        const security = card('Security');
        fireEvent.click(within(security).getByRole('button', { name: 'Adjust months' }));
        fireEvent.change(within(security).getByLabelText('Security June'), { target: { value: '150' } });
        fireEvent.change(within(security).getByLabelText('Security July'), { target: { value: '50' } });
        fireEvent.change(within(security).getByLabelText('Yearly budget for Security'), { target: { value: '2400' } });
        expect(within(security).getByLabelText('Security June')).toHaveProperty('value', '150');
        expect(within(security).getByTestId('budget-mismatch').textContent).toMatch(/Add ₦1,200\.00 to match\./);
    });

    it('saves only the changed categories, then refreshes', async () => {
        renderScreen();
        fireEvent.change(within(card('Water')).getByLabelText('Yearly budget for Water'), { target: { value: '120' } });
        fireEvent.click(saveButton());
        await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
        expect(mocks.saveBudgetYear).toHaveBeenCalledWith({ year: 2026, categories: [{ categoryId: CAT_B, yearly: 120, months: Array(12).fill(10) }] });
        expect(mocks.toastSuccess).toHaveBeenCalledWith('Budgets for 2026 saved');
    });

    it('shows the server refusal and does not refresh', async () => {
        mocks.saveBudgetYear.mockResolvedValue({ error: 'Unauthorized' });
        renderScreen();
        fireEvent.change(within(card('Water')).getByLabelText('Yearly budget for Water'), { target: { value: '120' } });
        fireEvent.click(saveButton());
        await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Unauthorized'));
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('view-only: amounts as text, Show months read-only, no inputs, no Save or Reset', () => {
        mocks.canManage = false;
        renderScreen();
        const security = card('Security');
        expect(within(security).queryByRole('textbox')).toBeNull();
        expect(within(security).getByText('₦1,200.00')).toBeTruthy();
        expect(within(card('Water')).getByText('No budget set')).toBeTruthy();
        fireEvent.click(within(security).getByRole('button', { name: 'Show months' }));
        expect(within(security).getAllByText('₦100.00')).toHaveLength(12);
        expect(within(security).queryByRole('button', { name: 'Reset to even split' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Save budgets' })).toBeNull();
    });

    it('a refused load shows the reason, never an empty list', () => {
        renderScreen({ budget: null, error: "Unauthorized: Missing permission 'view_expenditure'" });
        expect(screen.getByRole('alert').textContent).toMatch(/Budgets could not be loaded.*view_expenditure/);
        expect(screen.queryByText('No expense categories')).toBeNull();
    });

    it('no categories shows an empty state', () => {
        renderScreen({ budget: { year: 2026, categories: [] } });
        expect(screen.getByText('No expense categories')).toBeTruthy();
    });
});
