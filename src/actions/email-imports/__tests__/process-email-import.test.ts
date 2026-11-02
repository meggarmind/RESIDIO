import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailTransactions, processSingleTransaction } from '../process-email-import';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { createPayment } from '@/actions/payments/create-payment';
import { createPaymentCore } from '@/lib/payments/create-payment';
import { logAudit } from '@/lib/audit/logger';
import { createExpense } from '@/actions/expenses/create-expense';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: vi.fn(),
    createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: vi.fn(),
}));

// The auto-process limit setting (#710) is absent here, so the N60,000 default applies.
vi.mock('@/lib/settings/service', () => ({
    getSettingResultAsService: vi.fn(async () => ({ status: 'absent' })),
}));

vi.mock('@/lib/auth/action-roles', () => ({
    PERMISSIONS: {
        EMAIL_IMPORTS_PROCESS: 'email_imports_process',
        EMAIL_IMPORTS_VIEW: 'email_imports_view',
        PAYMENTS_VERIFY: 'payments.verify',
        IMPORTS_APPROVE: 'imports.approve',
    },
}));

vi.mock('@/lib/audit/logger', () => ({
    logAudit: vi.fn(),
}));

vi.mock('@/actions/payments/create-payment', () => ({
    createPayment: vi.fn(),
}));

vi.mock('@/lib/payments/create-payment', () => ({
    createPaymentCore: vi.fn(),
}));

vi.mock('@/actions/expenses/create-expense', () => ({
    createExpense: vi.fn(),
}));

vi.mock('@/lib/matching/resident-matcher', () => ({
    createMatcher: vi.fn(() => ({
        match: vi.fn((data) => {
            if (data.description.includes('Matched')) {
                return { resident_id: 'res_123', confidence: 'high', method: 'alias', all_matches: [] };
            }
            return { resident_id: null, confidence: 'none', method: 'none', all_matches: [] };
        })
    }))
}));

describe('Email Import Processing', () => {
    let mockSupabase: { from: ReturnType<typeof vi.fn> };

    const createMockQuery = (data: unknown = [], error: unknown = null) => {
        const query: {
            data: unknown;
            error: unknown;
            select: ReturnType<typeof vi.fn>;
            eq: ReturnType<typeof vi.fn>;
            in: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
            insert: ReturnType<typeof vi.fn>;
            single: ReturnType<typeof vi.fn>;
            order: ReturnType<typeof vi.fn>;
            limit: ReturnType<typeof vi.fn>;
            range: ReturnType<typeof vi.fn>;
            then: ReturnType<typeof vi.fn>;
        } = {
            data,
            error,
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            then: vi.fn((onFulfilled) => onFulfilled({ data, error })),
        };
        return query;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSupabase = {
            from: vi.fn().mockImplementation(() => createMockQuery()),
        };
        vi.mocked(createAdminClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createAdminClient>>);
        vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);
        vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'user_123' } as unknown as Awaited<ReturnType<typeof authorizePermission>>);
    });

    describe('matchEmailTransactions', () => {
        it('should match credit transactions and queue debits', async () => {
            const mockTransactions = [
                { id: 'tx_1', transaction_type: 'credit', description: 'Matched Payment', amount: 1000, status: 'pending' },
                { id: 'tx_2', transaction_type: 'debit', description: 'Office Supplies', amount: 500, status: 'pending' },
            ];

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'email_transactions') {
                    // This will return mockTransactions for the fetch
                    return createMockQuery(mockTransactions);
                }
                return createMockQuery();
            });

            const result = await matchEmailTransactions('import_123');

            expect(result.matched).toBe(1);
            expect(result.unmatched).toBe(1);
        });
    });

    describe('processEmailTransactions', () => {
        it('should create payments for matched credits and expenses for debits', async () => {
            const mockCredits = [
                {
                    id: 'tx_1',
                    transaction_type: 'credit',
                    status: 'matched',
                    matched_resident_id: 'res_123',
                    amount: 1000,
                    match_confidence: 'high',
                    match_method: 'alias',
                    bank_account_last4: '1234',
                    email_messages: { email_type: 'transaction_alert', sender_verified: true, sender_check: 'dkim=pass' },
                },
            ];

            const mockDebits = [
                {
                    id: 'tx_2',
                    transaction_type: 'debit',
                    status: 'queued_for_review',
                    matched_expense_category_id: 'cat_123',
                    amount: 500
                },
            ];

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'email_transactions') {
                    const query = createMockQuery();
                    query.eq.mockImplementation((col: string, val: unknown) => {
                        if (val === 'matched') return createMockQuery(mockCredits);
                        if (val === 'debit') {
                            const debitQuery = createMockQuery();
                            debitQuery.in = vi.fn().mockReturnValue(createMockQuery(mockDebits));
                            return debitQuery;
                        }
                        return query;
                    });
                    return query;
                }
                if (table === 'estate_bank_accounts') return createMockQuery([{ account_number: '0001234' }]);
                return createMockQuery();
            });

            vi.mocked(createPayment).mockResolvedValue({ success: true, data: { id: 'pay_123' } } as unknown as Awaited<ReturnType<typeof createPayment>>);
            vi.mocked(createExpense).mockResolvedValue({ data: { id: 'exp_123' }, error: null } as unknown as Awaited<ReturnType<typeof createExpense>>);

            const result = await processEmailTransactions('import_123');

            expect(result.autoProcessed).toBe(1);
            expect(result.expensesCreated).toBe(1);
        });

        it('records a debit as errored (does not abort) when createExpense rejects it', async () => {
            const mockDebits = [
                { id: 'tx_bad', transaction_type: 'debit', status: 'queued_for_review', matched_expense_category_id: 'cat_123', amount: 0.001 },
            ];

            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'email_transactions') {
                    const query = createMockQuery();
                    query.eq.mockImplementation((col: string, val: unknown) => {
                        if (val === 'matched') return createMockQuery([]);
                        if (val === 'debit') {
                            const debitQuery = createMockQuery();
                            debitQuery.in = vi.fn().mockReturnValue(createMockQuery(mockDebits));
                            return debitQuery;
                        }
                        return query;
                    });
                    return query;
                }
                return createMockQuery();
            });

            vi.mocked(createExpense).mockResolvedValue({ data: null, error: 'Expense amount can have at most 2 decimal places' });

            const result = await processEmailTransactions('import_123');

            expect(result.errored).toBe(1);
            expect(result.expensesCreated).toBe(0);
        });
    });

    describe('processSingleTransaction credit: the sender check is bank proof (#1428)', () => {
        const queued = (senderVerified: boolean | null, embedded: 'object' | 'array' | 'none' = 'object') => ({
            id: 'tx_9',
            transaction_type: 'credit',
            status: 'queued_for_review',
            amount: 1000,
            description: 'FIP:ZIB/HENRY/ Henry Itoki',
            reference: 'REF-9',
            transaction_date: '2026-11-02',
            email_import_id: '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7',
            matched_resident_id: null,
            email_messages: embedded === 'none' ? null : embedded === 'array' ? [{ sender_verified: senderVerified }] : { sender_verified: senderVerified },
        });

        function setup(tx: ReturnType<typeof queued>, permissions: string[]) {
            const selects: unknown[] = [];
            mockSupabase.from.mockImplementation((table: string) => {
                const q = createMockQuery(table === 'email_transactions' ? tx : null);
                q.select.mockImplementation((columns: unknown) => {
                    selects.push(columns);
                    return q;
                });
                return q;
            });
            vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'user_123', permissions, roleName: 'chairman' } as unknown as Awaited<ReturnType<typeof authorizePermission>>);
            vi.mocked(createPayment).mockResolvedValue({ success: true, data: { id: 'pay_unverified' } } as unknown as Awaited<ReturnType<typeof createPayment>>);
            vi.mocked(createPaymentCore).mockResolvedValue({ success: true, data: { id: 'pay_verified' } } as unknown as Awaited<ReturnType<typeof createPaymentCore>>);
            return selects;
        }

        const auditValues = () => (vi.mocked(logAudit).mock.calls.at(-1)![0] as { newValues: Record<string, unknown> }).newValues;

        it('records the payment verified when the email passed the sender check and the admin holds payments.verify', async () => {
            const selects = setup(queued(true), ['email_imports_process', 'payments.verify']);
            const result = await processSingleTransaction('tx_9', { residentId: 'res_1' });
            expect(result).toEqual({ success: true, paymentId: 'pay_verified' });
            expect(selects[0]).toContain('email_messages(sender_verified)');
            expect(createPayment).not.toHaveBeenCalled();
            expect(createPaymentCore).toHaveBeenCalledTimes(1);
            const [data, options] = vi.mocked(createPaymentCore).mock.calls[0];
            expect(options).toEqual({ trustedVerification: true });
            expect(data).toEqual(expect.objectContaining({ is_verified: true, resident_id: 'res_1', amount: 1000, email_transaction_id: 'tx_9', notes: 'Email import: FIP:ZIB/HENRY/ Henry Itoki' }));
            expect(auditValues()).toEqual(expect.objectContaining({ payment_id: 'pay_verified', verified: true }));
        });

        it('reads the sender check from an embed returned as an array', async () => {
            setup(queued(true, 'array'), ['email_imports_process', 'payments.verify']);
            expect(await processSingleTransaction('tx_9', { residentId: 'res_1' })).toEqual({ success: true, paymentId: 'pay_verified' });
        });

        it('records it unverified when the admin lacks payments.verify, even with a checked email', async () => {
            setup(queued(true), ['email_imports_process', 'payments.create']);
            const result = await processSingleTransaction('tx_9', { residentId: 'res_1' });
            expect(result).toEqual({ success: true, paymentId: 'pay_unverified' });
            expect(createPaymentCore).not.toHaveBeenCalled();
            expect(createPayment).toHaveBeenCalledTimes(1);
            expect(vi.mocked(createPayment).mock.calls[0][0]).not.toHaveProperty('is_verified');
            expect(auditValues()).toEqual(expect.objectContaining({ payment_id: 'pay_unverified', verified: false }));
        });

        it.each([
            ['false', queued(false)],
            ['null', queued(null)],
            ['missing', queued(null, 'none')],
        ])('records it unverified when the sender check is %s, even with payments.verify', async (_label, tx) => {
            setup(tx, ['email_imports_process', 'payments.verify']);
            const result = await processSingleTransaction('tx_9', { residentId: 'res_1' });
            expect(result).toEqual({ success: true, paymentId: 'pay_unverified' });
            expect(createPaymentCore).not.toHaveBeenCalled();
            expect(createPayment).toHaveBeenCalledTimes(1);
            expect(auditValues()).toEqual(expect.objectContaining({ verified: false }));
        });

        it('keeps the over-limit rule for a checked email', async () => {
            setup({ ...queued(true), amount: 70000 }, ['email_imports_process', 'payments.verify']);
            const result = await processSingleTransaction('tx_9', { residentId: 'res_1' });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/^Needs approval: payments over ₦60,000/);
            expect(createPaymentCore).not.toHaveBeenCalled();
            expect(createPayment).not.toHaveBeenCalled();
        });
    });
});
