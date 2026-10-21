import { describe, expect, it } from 'vitest';
import { lagosDayStart, loadAccountStatement } from '@/lib/billing/account-statement-data';

type Filter = { op: string; args: unknown[] };

// Chainable stub: every call is recorded per table; awaiting it yields an empty result.
function stubClient() {
    const calls: Record<string, Filter[]> = {};
    const from = (table: string) => {
        const log = (calls[table] ??= []);
        const result = table === 'residents' || table === 'resident_wallets'
            ? { data: { id: 'x', first_name: 'A', last_name: 'B', entity_type: 'individual' }, error: null }
            : { data: [], error: null };
        const q: Record<string, unknown> = {
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
        };
        for (const op of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'or', 'order', 'single']) {
            q[op] = (...args: unknown[]) => {
                log.push({ op, args });
                return op === 'single' ? Promise.resolve(result) : q;
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

describe('lagosDayStart', () => {
    it('is 23:00 UTC of the previous day', () => {
        expect(lagosDayStart('2026-10-01')).toBe('2026-09-30T23:00:00.000Z');
    });
    it('adds whole days', () => {
        expect(lagosDayStart('2026-10-31', 1)).toBe('2026-10-31T23:00:00.000Z');
    });
});

describe('loadAccountStatement timestamp bounds (#945)', () => {
    it('bounds wallet and invoice created_at by Lagos days, end exclusive', async () => {
        const { client, calls } = stubClient();
        await loadAccountStatement(client, {
            residentId: 'r', fromDate: '2026-10-01', toDate: '2026-10-31',
        } as never);

        const wallet = calls.wallet_transactions;
        // 23:30 Lagos on the last day = 22:30Z 31 Oct, below the exclusive end 23:00Z 31 Oct
        expect(wallet).toContainEqual({ op: 'lt', args: ['created_at', '2026-10-31T23:00:00.000Z'] });
        // 00:30 Lagos on the first day = 23:30Z 30 Sep, at/after the inclusive start
        expect(wallet).toContainEqual({ op: 'gte', args: ['created_at', '2026-09-30T23:00:00.000Z'] });
        expect(wallet.some((f) => f.op === 'lte')).toBe(false);

        const ors = calls.invoices.filter((f) => f.op === 'or').map((f) => f.args[0] as string);
        expect(ors[0]).toContain('created_at.gte.2026-09-30T23:00:00.000Z,created_at.lt.2026-10-31T23:00:00.000Z');
        expect(ors[0]).not.toMatch(/created_at\.lte/);
        expect(ors[1]).toContain('created_at.lt.2026-09-30T23:00:00.000Z');
    });
});
