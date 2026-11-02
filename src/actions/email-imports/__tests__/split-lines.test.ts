/**
 * Issue #1443: Approve on a bank alert can split it into lines, each with a charge category.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processSingleTransaction } from '../process-email-import';
import { createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { createPayment } from '@/actions/payments/create-payment';
import { createPaymentCore } from '@/lib/payments/create-payment';
import { reversePaymentSettlement } from '@/lib/payments/reverse-payment-settlement';
import { logAudit } from '@/lib/audit/logger';

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn(async () => ({ status: 'absent' })) }));
vi.mock('@/lib/auth/action-roles', () => ({
    PERMISSIONS: {
        EMAIL_IMPORTS_PROCESS: 'email_imports_process',
        PAYMENTS_VERIFY: 'payments.verify',
        IMPORTS_APPROVE: 'imports.approve',
    },
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/actions/payments/create-payment', () => ({ createPayment: vi.fn() }));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentCore: vi.fn() }));
vi.mock('@/actions/expenses/create-expense', () => ({ createExpense: vi.fn() }));
vi.mock('@/lib/payments/reverse-payment-settlement', () => ({ reversePaymentSettlement: vi.fn() }));

const TX = {
    id: 'tx_1',
    transaction_type: 'credit',
    status: 'queued_for_review',
    amount: 1000,
    description: 'RAPHAEL W',
    reference: 'REF-1',
    transaction_date: '2026-10-31',
    email_import_id: 'imp_1',
    matched_resident_id: null,
    email_messages: { sender_verified: false },
};

let updates: Array<{ table: string; values: unknown }>;
let deletedIds: string[];
let queueFilters: Array<[string, unknown]>;

function fakeAdmin() {
    return {
        from(table: string) {
            let mode: 'select' | 'update' | 'delete' = 'select';
            let values: unknown;
            let id: unknown;
            let activeFilter = false;
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.update = (v: unknown) => ((mode = 'update'), (values = v), chain);
            chain.delete = () => ((mode = 'delete'), chain);
            chain.eq = (col: string, v: unknown) => {
                if (col === 'id') id = v;
                if (table === 'notification_queue') queueFilters.push([col, v]);
                if (col === 'is_active') activeFilter = v === true;
                return chain;
            };
            chain.single = async () => {
                if (table === 'email_transactions') return { data: TX, error: null };
                if (table === 'payment_records') return { data: { id, resident_id: 'res_1', amount: 400, reference_number: 'REF-1' }, error: null };
                return { data: null, error: null };
            };
            chain.then = (ok: (v: unknown) => unknown) => {
                if (table === 'charge_categories') {
                    // Honours the is_active filter: 'retired' exists but is inactive.
                    const all = [{ code: 'dues', active: true }, { code: 'toll_gate_levy', active: true }, { code: 'other', active: true }, { code: 'retired', active: false }];
                    return ok({ data: all.filter((c) => !activeFilter || c.active).map(({ code }) => ({ code })), error: null });
                }
                if (mode === 'update') updates.push({ table, values });
                if (mode === 'delete') deletedIds.push(String(id));
                return ok({ data: null, error: null });
            };
            return chain;
        },
    };
}

const PERMS = ['email_imports_process', 'payments.verify'];

beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    deletedIds = [];
    queueFilters = [];
    vi.mocked(createAdminClient).mockResolvedValue(fakeAdmin() as never);
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'u1', permissions: PERMS, roleName: 'chairman' } as never);
    vi.mocked(reversePaymentSettlement).mockResolvedValue(null);
    let n = 0;
    vi.mocked(createPayment).mockImplementation((async () => ({ data: { id: `pay_${++n}` }, error: null })) as never);
    vi.mocked(createPaymentCore).mockImplementation((async () => ({ data: { id: `pay_${++n}` }, error: null })) as never);
});

const createdInputs = () => vi.mocked(createPayment).mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('processSingleTransaction lines (#1443)', () => {
    it('records one dues payment for the whole amount when there are no lines', async () => {
        const result = await processSingleTransaction('tx_1', { residentId: 'res_1' });
        expect(result).toEqual({ success: true, paymentId: 'pay_1' });
        const inputs = createdInputs();
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toMatchObject({ charge_category: 'dues', amount: 1000, notes: 'Email import: RAPHAEL W' });
        expect(inputs[0]).not.toHaveProperty('split_payment_group_id');
    });

    it('records one payment per line with its category, amount, comment and one shared group id', async () => {
        const result = await processSingleTransaction('tx_1', {
            residentId: 'res_1',
            lines: [
                { chargeCategory: 'toll_gate_levy', amount: 600.5 },
                { chargeCategory: 'other', amount: 399.5, comment: ' gate repair ' },
            ],
        });
        expect(result).toEqual({ success: true, paymentId: 'pay_1' });
        const inputs = createdInputs();
        expect(inputs).toHaveLength(2);
        expect(inputs[0]).toMatchObject({ charge_category: 'toll_gate_levy', amount: 600.5, email_transaction_id: 'tx_1', reference_number: 'REF-1', notes: 'Email import: RAPHAEL W' });
        expect(inputs[1]).toMatchObject({ charge_category: 'other', amount: 399.5, notes: 'Email import: RAPHAEL W · gate repair' });
        expect(inputs[0].split_payment_group_id).toEqual(expect.any(String));
        expect(inputs[1].split_payment_group_id).toBe(inputs[0].split_payment_group_id);
        expect(updates.find((u) => u.table === 'email_transactions')?.values).toMatchObject({ status: 'processed', payment_id: 'pay_1' });
        const audit = vi.mocked(logAudit).mock.calls.at(-1)![0] as { newValues: Record<string, unknown> };
        expect(audit.newValues.payment_ids).toEqual(['pay_1', 'pay_2']);
        expect(audit.newValues.lines).toEqual([
            { charge_category: 'toll_gate_levy', amount: 600.5, comment: undefined },
            { charge_category: 'other', amount: 399.5, comment: 'gate repair' },
        ]);
    });

    it('gives a single line no group id', async () => {
        await processSingleTransaction('tx_1', { residentId: 'res_1', lines: [{ chargeCategory: 'toll_gate_levy', amount: 1000 }] });
        expect(createdInputs()[0]).toMatchObject({ charge_category: 'toll_gate_levy' });
        expect(createdInputs()[0]).not.toHaveProperty('split_payment_group_id');
    });

    it.each([
        ['sum mismatch', [{ chargeCategory: 'dues', amount: 500 }, { chargeCategory: 'toll_gate_levy', amount: 499.99 }], /add up/],
        ['inactive category', [{ chargeCategory: 'retired', amount: 1000 }], /Unknown or inactive/],
        ['null lines entry', [null], /not valid/],
        ['non-string comment', [{ chargeCategory: 'other', amount: 1000, comment: 5 }], /not valid/],
        ['non-numeric amount', [{ chargeCategory: 'dues', amount: '1000' }], /not valid/],
        ['unknown category', [{ chargeCategory: 'bogus', amount: 1000 }], /Unknown or inactive/],
        ['other without a comment', [{ chargeCategory: 'other', amount: 1000, comment: '   ' }], /needs a comment/],
        ['other with a long comment', [{ chargeCategory: 'other', amount: 1000, comment: 'x'.repeat(501) }], /needs a comment/],
        ['zero amount', [{ chargeCategory: 'dues', amount: 0 }, { chargeCategory: 'dues', amount: 1000 }], /above zero/],
        ['three decimals', [{ chargeCategory: 'dues', amount: 999.995 }, { chargeCategory: 'dues', amount: 0.005 }], /2 decimal/],
        ['no lines', [], /at least one line/],
    ])('refuses %s before any write', async (_label, lines, message) => {
        const result = await processSingleTransaction('tx_1', { residentId: 'res_1', lines: lines as never });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(message);
        expect(createPayment).not.toHaveBeenCalled();
        expect(createPaymentCore).not.toHaveBeenCalled();
        expect(updates).toEqual([]);
    });

    it('reverses and deletes the earlier lines when a later line fails, and leaves the alert queued', async () => {
        vi.mocked(createPayment)
            .mockResolvedValueOnce({ data: { id: 'pay_a' }, error: null } as never)
            .mockResolvedValueOnce({ data: null, error: 'Duplicate Payment Detected' } as never);
        const result = await processSingleTransaction('tx_1', {
            residentId: 'res_1',
            lines: [{ chargeCategory: 'dues', amount: 400 }, { chargeCategory: 'toll_gate_levy', amount: 600 }],
        });
        expect(result).toEqual({ success: false, error: 'Duplicate Payment Detected' });
        expect(reversePaymentSettlement).toHaveBeenCalledTimes(1);
        expect(vi.mocked(reversePaymentSettlement).mock.calls[0][1]).toMatchObject({ id: 'pay_a' });
        expect(deletedIds).toEqual(['pay_a']);
        expect(vi.mocked(logAudit).mock.calls.some((c) => (c[0] as { action: string; entityId: string }).action === 'DELETE' && (c[0] as { entityId: string }).entityId === 'pay_a')).toBe(true);
        expect(updates.some((u) => u.table === 'email_transactions')).toBe(false);
        // The queued "payment received" WhatsApp of the undone line is cancelled, only while pending.
        const cancel = updates.find((u) => u.table === 'notification_queue');
        expect(cancel?.values).toMatchObject({ status: 'cancelled' });
        expect(queueFilters).toEqual(expect.arrayContaining([['deduplication_key', 'payment_received:pay_a'], ['status', 'pending']]));
    });

    it('does not delete a payment whose settlement could not be reversed, and says so', async () => {
        vi.mocked(createPayment)
            .mockResolvedValueOnce({ data: { id: 'pay_a' }, error: null } as never)
            .mockResolvedValueOnce({ data: null, error: 'boom' } as never);
        vi.mocked(reversePaymentSettlement).mockResolvedValue('credit already spent');
        const result = await processSingleTransaction('tx_1', {
            residentId: 'res_1',
            lines: [{ chargeCategory: 'dues', amount: 400 }, { chargeCategory: 'dues', amount: 600 }],
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('credit already spent');
        expect(deletedIds).toEqual([]);
    });
});
