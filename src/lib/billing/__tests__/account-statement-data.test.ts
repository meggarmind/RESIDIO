import { describe, expect, it } from 'vitest';
import { loadAccountStatement } from '@/lib/billing/account-statement-data';

type Filter = { op: string; args: unknown[] };

// Chainable stub: every call is recorded per table; awaiting it yields an empty result.
function stubClient() {
    const calls: Record<string, Filter[]> = {};
    const from = (table: string) => {
        const log = (calls[table] ??= []);
        const result = table === 'residents'
            ? { data: { id: 'x', first_name: 'A', last_name: 'B', entity_type: 'individual' }, error: null }
            : table === 'resident_wallets'
                ? { data: [{ id: 'x' }], error: null }
                : { data: [], error: null };
        const q: Record<string, unknown> = {
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
        };
        for (const op of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'lt', 'or', 'is', 'order', 'single', 'maybeSingle']) {
            q[op] = (...args: unknown[]) => {
                log.push({ op, args });
                return op === 'single' || op === 'maybeSingle' ? Promise.resolve(result) : q;
            };
        }
        return q;
    };
    const client = {
        from,
        auth: { getUser: async () => ({ data: { user: null } }) },
    };
    return { client: client as never, calls };
}

describe('loadAccountStatement timestamp bounds (#945)', () => {
    it.each([['2026-13-45', '2026-10-31'], ['2026-10-01', '2026-13-45'], ['2026-02-30', '2026-10-31'], ['2026-10-01', '2026-02-31']])(
        'returns the format error for calendar-invalid dates %s..%s without throwing',
        async (fromDate, toDate) => {
            const { client } = stubClient();
            await expect(
                loadAccountStatement(client, { residentId: 'r', fromDate, toDate } as never, { rollForward: false }),
            ).resolves.toEqual({ data: null, error: 'Dates must be in YYYY-MM-DD format' });
        },
    );

    it('bounds wallet and invoice created_at by Lagos days, end exclusive', async () => {
        const { client, calls } = stubClient();
        await loadAccountStatement(client, {
            residentId: 'r', fromDate: '2026-10-01', toDate: '2026-10-31',
        } as never, { rollForward: false });

        const wallet = calls.wallet_transactions;
        // 23:30 Lagos on the last day = 22:30Z 31 Oct, below the exclusive end 23:00Z 31 Oct
        expect(wallet).toContainEqual({ op: 'lt', args: ['created_at', '2026-10-31T23:00:00.000Z'] });
        // 00:30 Lagos on the first day = 23:30Z 30 Sep, at/after the inclusive start
        expect(wallet).toContainEqual({ op: 'gte', args: ['created_at', '2026-09-30T23:00:00.000Z'] });
        expect(wallet.some((f) => f.op === 'lte')).toBe(false);

        const ors = calls.invoices.filter((f) => f.op === 'or').map((f) => f.args[0] as string);
        expect(ors[0]).toContain('created_at.gte."2026-09-30T23:00:00.000Z",created_at.lt."2026-10-31T23:00:00.000Z"');
        expect(ors[0]).not.toMatch(/created_at\.lte/);
        expect(ors[1]).toContain('created_at.lt."2026-09-30T23:00:00.000Z"');
    });
});

// A stub whose tables return the given rows; `table:prior` rows answer the reads of what came before the
// period. `rpc` answers resident_account_balance.
function dataClient(tables: Record<string, unknown>, balance?: Record<string, number>) {
    const from = (table: string) => {
        const ops: Array<[string, unknown[]]> = [];
        const result = () => {
            const prior = ops.some(([op, args]) => op === 'or' && String(args[0]).startsWith('period_start.lt'))
                || (ops.some(([op]) => op === 'lt') && !ops.some(([op]) => op === 'gte'));
            return { data: (prior ? tables[`${table}:prior`] : tables[table]) ?? [], error: null };
        };
        const q: Record<string, unknown> = { then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res) };
        for (const op of ['select', 'eq', 'in', 'neq', 'gte', 'lte', 'lt', 'or', 'is', 'order']) q[op] = (...args: unknown[]) => { ops.push([op, args]); return q; };
        for (const op of ['single', 'maybeSingle']) q[op] = () => Promise.resolve(result());
        return q;
    };
    return {
        from,
        rpc: () => ({ single: async () => ({ data: balance, error: null }) }),
        auth: { getUser: async () => ({ data: { user: null } }) },
    } as never;
}

const categoryRows = [
    { code: 'dues', name: 'Dues' },
    { code: 'development_levy', name: 'Development Levy' },
];

const statementTables = {
    residents: { id: 'r', first_name: 'Ada', last_name: 'Example', resident_code: 'RES1', entity_type: 'individual' },
    charge_categories: categoryRows,
    resident_wallets: [{ id: 'w-dues', charge_category: 'dues' }, { id: 'w-levy', charge_category: 'development_levy' }],
    invoices: [
        { id: 'i1', invoice_number: 'INV1', amount_due: 50000, status: 'unpaid', invoice_type: 'service_charge', period_start: '2026-10-01', period_end: '2026-10-31', created_at: '2026-10-01T08:00:00Z', charge_category: 'dues', billing_profile: null },
        { id: 'i2', invoice_number: 'INV2', amount_due: 200000, status: 'unpaid', invoice_type: 'development_levy', period_start: '2026-10-01', period_end: '2026-10-31', created_at: '2026-10-01T08:00:00Z', charge_category: 'development_levy', billing_profile: null },
    ],
    payment_records: [{ id: 'p1', amount: 20000, payment_date: '2026-10-10', reference_number: null, method: 'bank_transfer', notes: null, charge_category: 'dues' }],
    wallet_transactions: [],
    collection_payers: { id: 'cp1' },
    collection_payments: [
        { id: 'c1', amount: 5000, quantity: null, unit_price: null, payment_date: '2026-10-12', reference: null, receipt_number: 'COL-2026-000001', house_id: null, collection: { name: 'Streetlights' } },
        { id: 'c2', amount: 3000, quantity: 1, unit_price: 3000, payment_date: '2026-10-13', reference: null, receipt_number: 'COL-2026-000002', house_id: 'other-house', collection: { name: 'Vehicle Sticker' } },
    ],
};

describe('loadAccountStatement sections (#1196)', () => {
    it('lists dues, levy and a collection payment as three sections with their own totals', async () => {
        const { data, error } = await loadAccountStatement(
            dataClient(statementTables),
            { residentId: 'r', fromDate: '2026-10-01', toDate: '2026-10-31' },
            { rollForward: false },
        );
        expect(error).toBeNull();
        expect(data!.categories.map((c) => [c.name, c.closingBalance])).toEqual([['Dues', 30000], ['Development Levy', 200000]]);
        expect(data!.collections!.lines.map((l) => l.collection_name)).toEqual(['Streetlights', 'Vehicle Sticker']);
        expect(data!.collections!.total).toBe(8000);
        // Collections change no balance: the account still closes at what is owed on invoices.
        expect(data!.closingBalance).toBe(230000);
    });

    it('lists only the collection payments of the statement house or with no house', async () => {
        const { data } = await loadAccountStatement(
            dataClient(statementTables),
            { residentId: 'r', houseId: 'h1', fromDate: '2026-10-01', toDate: '2026-10-31' },
            { rollForward: false },
        );
        expect(data!.collections!.lines.map((l) => l.receipt_number)).toEqual(['COL-2026-000001']);
    });

    it('splits the roll-forward opening balance by category', async () => {
        const tables = {
            ...statementTables,
            invoices: [],
            'invoices:prior': [
                { amount_due: 40000, charge_category: 'dues' },
                { amount_due: 100000, charge_category: 'development_levy' },
            ],
            payment_records: [],
            'payment_records:prior': [{ amount: 15000, charge_category: 'dues' }],
        };
        const { data } = await loadAccountStatement(
            dataClient(tables, { opening_balance: 125000, closing_balance: 125000, total_invoiced: 0, total_paid: 0, total_wallet_credits: 0, total_wallet_debits: 0, awaiting_verification: 0 }),
            { residentId: 'r', fromDate: '2026-10-01', toDate: '2026-10-31' },
            { rollForward: true },
        );
        expect(data!.openingBalance).toBe(125000);
        expect(data!.categories.map((c) => [c.code, c.openingBalance])).toEqual([['dues', 25000], ['development_levy', 100000]]);
    });
});
