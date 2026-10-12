import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateMonthlyInvoices } from '../generate-invoices';
import { runMonthlyInvoiceGeneration } from '@/lib/billing/generate-monthly-invoices';
import { authorizePermission } from '@/lib/auth/authorize';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { BILLING_CREATE_INVOICE: 'billing.create_invoice' } }));
vi.mock('@/lib/billing/generate-monthly-invoices', () => ({ runMonthlyInvoiceGeneration: vi.fn() }));

const authMock = vi.mocked(authorizePermission);
const runMock = vi.mocked(runMonthlyInvoiceGeneration);

// A forged client call can pass any extra argument; the signature no longer
// has a trigger slot, so it must never influence authorization or the trigger.
const forged = generateMonthlyInvoices as unknown as (
    date: Date,
    trigger: string,
) => ReturnType<typeof generateMonthlyInvoices>;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('generateMonthlyInvoices (exported server action) authorization (#470)', () => {
    it('refuses an unauthorized caller even when they pass "cron"', async () => {
        authMock.mockResolvedValue({ authorized: false, error: 'Unauthorized' } as Awaited<ReturnType<typeof authorizePermission>>);

        const result = await forged(new Date(), 'cron');

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Unauthorized');
        expect(authMock).toHaveBeenCalledWith('billing.create_invoice');
        expect(runMock).not.toHaveBeenCalled();
    });

    it('always runs the manual trigger as the authorised user, never a caller-chosen one', async () => {
        authMock.mockResolvedValue({ authorized: true, userId: 'user-1' } as Awaited<ReturnType<typeof authorizePermission>>);
        runMock.mockResolvedValue({ success: true, generated: 0, skipped: 0, skipReasons: [], errors: [] });
        const date = new Date('2026-10-01');

        await forged(date, 'cron');

        expect(runMock.mock.calls[0].slice(0, 3)).toEqual([date, 'manual', 'user-1']);
    });
});
