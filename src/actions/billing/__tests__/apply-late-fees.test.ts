import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyLateFees } from '../apply-late-fees';
import { getSettingValueAsService } from '@/actions/settings/get-settings';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/actions/settings/get-settings', () => ({
    getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: vi.fn(),
}));

vi.mock('@/lib/auth/action-roles', () => ({
    PERMISSIONS: {
        BILLING_APPLY_LATE_FEES: 'billing.apply_late_fees',
        BILLING_VIEW: 'billing.view',
    },
}));

vi.mock('@/lib/audit/logger', () => ({
    logAudit: vi.fn(),
}));

interface MockResult { data: unknown; error: unknown }

interface FluentQuery {
    select: (value?: unknown) => FluentQuery;
    eq: (column?: unknown, value?: unknown) => FluentQuery;
    in: (column?: unknown, value?: unknown) => FluentQuery;
    lt: (column?: unknown, value?: unknown) => FluentQuery;
    update: (values?: unknown) => FluentQuery;
    insert: (values?: unknown) => FluentQuery;
    order: (column?: unknown, options?: unknown) => FluentQuery;
    single: () => Promise<MockResult>;
    maybeSingle: () => Promise<MockResult>;
    then: (onFulfilled: (result: MockResult) => unknown, onRejected?: (error: unknown) => unknown) => Promise<unknown>;
}

/**
 * A fluent Supabase-query stand-in that resolves each `.from()` call from a
 * shared, ordered queue of results -- regardless of whether the call chain
 * terminates in `.single()` or is awaited directly (no terminal method).
 * Mirrors the pattern in invoice-generation-runs-actions.test.ts.
 */
const createMockClient = (results: MockResult[]) => {
    const queue = [...results];
    const take = (): MockResult => (queue.length ? queue.shift() as MockResult : { data: null, error: null });
    const makeChain = (): FluentQuery => {
        const chain = {} as FluentQuery;
        const fluent = vi.fn().mockReturnValue(chain);
        chain.select = fluent;
        chain.eq = fluent;
        chain.in = fluent;
        chain.lt = fluent;
        chain.update = fluent;
        chain.insert = fluent;
        chain.order = fluent;
        chain.single = vi.fn().mockImplementation(async () => take());
        chain.maybeSingle = chain.single;
        chain.then = (onFulfilled, onRejected) => Promise.resolve(take()).then(onFulfilled, onRejected);
        return chain;
    };
    return { from: vi.fn().mockImplementation(() => makeChain()) };
};

const settingsMock = vi.mocked(getSettingValueAsService);
const adminClientMock = vi.mocked(createAdminClient);
const serverClientMock = vi.mocked(createServerSupabaseClient);

const overdueInvoice = {
    id: 'invoice-1',
    invoice_number: 'INV-202608-A1',
    amount_due: 10000,
    due_date: '2026-07-01',
    status: 'unpaid',
    metadata: {},
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('applyLateFees (cron trigger) honours configured settings', () => {
    it('applies the configured late fee rate and grace period, not the compiled-in defaults', async () => {
        // Configured: 12% (not the code default of 5%), 3-day grace period
        // (not the code default of 7). If this read fell back to the RLS-bound
        // getSettingValue under cron (see #139), it would silently apply 5% /
        // 7 days instead -- residents charged on rules nobody set.
        settingsMock.mockImplementation(async (key: string) => {
            switch (key) {
                case 'late_fee_enabled': return true;
                case 'late_fee_type': return 'percentage';
                case 'late_fee_amount': return 12;
                case 'grace_period_days': return 3;
                default: return null;
            }
        });

        const client = createMockClient([
            { data: [], error: null }, // pending waivers
            { data: [overdueInvoice], error: null }, // overdue invoices
            { data: null, error: null }, // invoice update
            { data: null, error: null }, // invoice_items insert
            { data: { id: 'log-1' }, error: null }, // late_fee_log insert.select().single()
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await applyLateFees('cron');

        expect(result.success).toBe(true);
        expect(result.applied).toBe(1);
        // 12% of 10000 = 1200, not the 5%-default 500.
        expect(result.totalLateFees).toBe(1200);

        // Find the chain returned for the second `.from('invoices')` call --
        // the update, not the earlier select of overdue invoices -- and read
        // the payload from its first fluent call (`.update(payload)`, before
        // the following `.eq('id', ...)` reuses the same fluent mock).
        const invoicesCalls = client.from.mock.calls
            .map((args, i) => ({ table: args[0], chain: client.from.mock.results[i]?.value as FluentQuery }))
            .filter((c) => c.table === 'invoices');
        expect(invoicesCalls).toHaveLength(2); // select overdue invoices, then update
        const updateChain = invoicesCalls[1].chain;
        expect(vi.mocked(updateChain.update).mock.calls[0][0]).toMatchObject({
            amount_due: 11200, // 10000 + 1200
            metadata: expect.objectContaining({
                late_fee_amount: 1200,
                late_fee_rate: 12,
                late_fee_type: 'percentage',
            }),
        });

        // Uses the admin (service-role) client throughout the cron path, not
        // the RLS-bound server client.
        expect(serverClientMock).not.toHaveBeenCalled();
    });

    it('does not apply late fees when the enabled setting reads as configured-off', async () => {
        settingsMock.mockImplementation(async (key: string) => (key === 'late_fee_enabled' ? false : null));

        const result = await applyLateFees('cron');

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Late fees are not enabled');
    });
});
