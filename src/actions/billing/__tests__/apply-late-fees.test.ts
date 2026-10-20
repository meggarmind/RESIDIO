import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyLateFees } from '../apply-late-fees';
import { runLateFeeApplication } from '@/lib/billing/apply-late-fees';
import { authorizePermission } from '@/lib/auth/authorize';
import { getSettingValueAsService } from '@/lib/settings/service';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/settings/service', () => ({
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
    delete: () => FluentQuery;
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
        chain.delete = fluent;
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
    invoice_items: [{ amount: 10000, late_fee_applied_at: null }],
};

/** The chain returned for each `.from(table)` call, in call order. */
const chainsFor = (client: ReturnType<typeof createMockClient>, table: string) =>
    client.from.mock.calls
        .map((args, i) => ({ table: args[0], chain: client.from.mock.results[i]?.value as FluentQuery }))
        .filter((c) => c.table === table)
        .map((c) => c.chain);

const enableFees = () =>
    settingsMock.mockImplementation(async (key: string) => {
        switch (key) {
            case 'late_fee_enabled': return true;
            case 'late_fee_type': return 'percentage';
            case 'late_fee_amount': return 5;
            case 'grace_period_days': return 7;
            default: return null;
        }
    });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('runLateFeeApplication (cron trigger) honours configured settings', () => {
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
            { data: { id: 'item-1' }, error: null }, // invoice_items insert.select().single()
            { data: null, error: null }, // invoice update
            { data: { id: 'log-1' }, error: null }, // late_fee_log insert.select().single()
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await runLateFeeApplication('cron');

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
        expect(vi.mocked(updateChain.update).mock.calls[0][0]).toEqual({
            amount_due: 11200, // 10000 + 1200
        });
        const [itemChain] = chainsFor(client, 'invoice_items');
        expect(vi.mocked(itemChain.insert).mock.calls[0][0]).toMatchObject({
            invoice_id: 'invoice-1',
            amount: 1200,
            description: 'Late Fee (auto)',
            late_fee_applied_at: expect.any(String),
        });

        // Uses the admin (service-role) client throughout the cron path, not
        // the RLS-bound server client.
        expect(serverClientMock).not.toHaveBeenCalled();
    });

    it('does not apply late fees when the enabled setting reads as configured-off', async () => {
        settingsMock.mockImplementation(async (key: string) => (key === 'late_fee_enabled' ? false : null));

        const result = await runLateFeeApplication('cron');

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Late fees are not enabled');
    });
});

describe('runLateFeeApplication uses only columns the schema has (#806)', () => {
    // Residio_Stage has no invoices.metadata and no invoice_items.name/quantity, so
    // selecting or writing them failed every run; the late-fee item is the marker.
    it('reads and writes no invoices.metadata and inserts only real invoice_items columns', async () => {
        enableFees();
        const client = createMockClient([
            { data: [], error: null },
            { data: [overdueInvoice], error: null },
            { data: { id: 'item-1' }, error: null },
            { data: null, error: null },
            { data: { id: 'log-1' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await runLateFeeApplication('cron');

        expect(result.errors).toEqual([]);
        const [selectChain, updateChain] = chainsFor(client, 'invoices');
        const selected = vi.mocked(selectChain.select).mock.calls[0][0] as string;
        expect(selected).not.toContain('metadata');
        expect(selected).toContain('invoice_items(amount, late_fee_applied_at)');
        expect(Object.keys(vi.mocked(updateChain.update).mock.calls[0][0] as object)).toEqual(['amount_due']);
        const [itemChain] = chainsFor(client, 'invoice_items');
        expect(Object.keys(vi.mocked(itemChain.insert).mock.calls[0][0] as object).sort()).toEqual(['amount', 'description', 'invoice_id', 'late_fee_applied_at']);
    });

    it('skips an invoice that already carries a late-fee item, writing nothing to it', async () => {
        enableFees();
        const charged = {
            ...overdueInvoice,
            invoice_items: [...overdueInvoice.invoice_items, { amount: 500, late_fee_applied_at: '2026-10-01T00:00:00Z' }],
        };
        const client = createMockClient([
            { data: [], error: null },
            { data: [charged], error: null },
            { data: { id: 'log-1' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await runLateFeeApplication('cron');

        expect(result.applied).toBe(0);
        expect(result.skippedAlreadyApplied).toBe(1);
        expect(chainsFor(client, 'invoice_items')).toHaveLength(0);
        expect(chainsFor(client, 'invoices')).toHaveLength(1);
    });

    it('charges an invoice whose admin line is typed as the reserved description (#830)', async () => {
        enableFees();
        const adjusted = {
            ...overdueInvoice,
            invoice_items: [...overdueInvoice.invoice_items, { description: 'Late Fee (auto)', amount: 200, late_fee_applied_at: null }],
        };
        const client = createMockClient([
            { data: [], error: null },
            { data: [adjusted], error: null },
            { data: { id: 'item-1' }, error: null },
            { data: null, error: null },
            { data: { id: 'log-1' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await runLateFeeApplication('cron');

        expect(result.applied).toBe(1);
        expect(result.skippedAlreadyApplied).toBe(0);
        const [itemChain] = chainsFor(client, 'invoice_items');
        expect(vi.mocked(itemChain.insert).mock.calls[0][0]).toMatchObject({ description: 'Late Fee (auto)' });
    });

    it('removes the late-fee item when the invoice amount update fails, so the next run retries', async () => {
        enableFees();
        const client = createMockClient([
            { data: [], error: null },
            { data: [overdueInvoice], error: null },
            { data: { id: 'item-1' }, error: null },
            { data: null, error: { message: 'update refused' } },
            { data: null, error: null }, // invoice_items delete
            { data: { id: 'log-1' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);

        const result = await runLateFeeApplication('cron');

        expect(result.applied).toBe(0);
        expect(result.errors).toEqual(['Failed to apply late fee to invoice INV-202608-A1: update refused']);
        const [, deleteChain] = chainsFor(client, 'invoice_items');
        expect(deleteChain.delete).toHaveBeenCalled();
        expect(vi.mocked(deleteChain.eq).mock.calls).toContainEqual(['id', 'item-1']);
    });
});

describe('applyLateFees (exported server action) authorization (#470)', () => {
    const authMock = vi.mocked(authorizePermission);
    // A forged client call can pass any extra argument; there is no trigger slot.
    const forged = applyLateFees as unknown as (trigger: string) => ReturnType<typeof applyLateFees>;

    it('takes no trigger parameter, so a caller cannot opt out of authorization', () => {
        expect(applyLateFees.length).toBe(0);
    });

    it('refuses a role-less caller who passes "cron", and never touches the service role', async () => {
        authMock.mockResolvedValue({ authorized: false, error: 'Unauthorized' } as Awaited<ReturnType<typeof authorizePermission>>);

        const result = await forged('cron');

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Unauthorized');
        expect(authMock).toHaveBeenCalledWith('billing.apply_late_fees');
        expect(adminClientMock).not.toHaveBeenCalled();
        expect(serverClientMock).not.toHaveBeenCalled();
        expect(settingsMock).not.toHaveBeenCalled();
    });

    it('runs as the manual trigger for the authorised user, ignoring a forged "cron" argument', async () => {
        authMock.mockResolvedValue({ authorized: true, userId: 'user-1' } as Awaited<ReturnType<typeof authorizePermission>>);
        settingsMock.mockImplementation(async (key: string) => (key === 'late_fee_enabled' ? true : null));
        serverClientMock.mockResolvedValue(
            createMockClient([
                { data: [], error: null }, // pending waivers
                { data: [], error: null }, // overdue invoices (none)
            ]) as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>,
        );
        const logClient = createMockClient([{ data: { id: 'log-1' }, error: null }]);
        adminClientMock.mockReturnValue(logClient as unknown as ReturnType<typeof createAdminClient>);

        const result = await forged('cron');

        expect(result.success).toBe(true);
        expect(serverClientMock).toHaveBeenCalled(); // user-scoped client, not service role, for the run
        const logChain = logClient.from.mock.results[0].value as FluentQuery;
        expect(vi.mocked(logChain.insert).mock.calls[0][0]).toMatchObject({
            trigger_type: 'manual',
            triggered_by: 'user-1',
        });
    });
});
