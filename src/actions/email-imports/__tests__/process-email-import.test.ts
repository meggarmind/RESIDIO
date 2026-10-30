import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailTransactions } from '../process-email-import';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { createPayment } from '@/actions/payments/create-payment';
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
        EMAIL_IMPORTS_VIEW: 'email_imports_view'
    },
}));

vi.mock('@/lib/audit/logger', () => ({
    logAudit: vi.fn(),
}));

vi.mock('@/actions/payments/create-payment', () => ({
    createPayment: vi.fn(),
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
                    // The credit read: .eq('email_import_id').in('status', ['matched', 'pending'])
                    query.in.mockImplementation((col: string, val: unknown) =>
                        Array.isArray(val) && val.includes('matched') ? createMockQuery(mockCredits) : query);
                    return query;
                }
                if (table === 'estate_bank_accounts') return createMockQuery([{ account_number: '0001234' }]);
                return createMockQuery();
            });

            vi.mocked(createPayment).mockResolvedValue({ success: true, data: { id: 'pay_123' } } as unknown as Awaited<ReturnType<typeof createPayment>>);
            vi.mocked(createExpense).mockResolvedValue({ data: { id: 'exp_123' }, error: null } as unknown as Awaited<ReturnType<typeof createExpense>>);

            const result = await processEmailTransactions('import_123');

            expect(createPayment).toHaveBeenCalledTimes(1);
            expect(result.autoProcessed).toBe(2);
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
});
