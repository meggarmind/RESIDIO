import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerSupabaseClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => createServerSupabaseClient() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getYearlyWalletTransactions } from '@/actions/billing/wallet';

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const WALLET = '33333333-3333-4333-8333-333333333333';
const SERVER_MAX_ROWS = 1000; // PostgREST max_rows

type Row = { id: string; wallet_id?: string; type: 'credit' | 'debit'; amount: number; balance_after: number; created_at: string };

/** Fake client whose wallet_transactions reads honour .range() and the server row cap. */
function fakeClient(rows: Row[], walletIds: string[] = [WALLET]) {
    const selects: string[] = [];
    const client = {
        from(table: string) {
            let range: [number, number] | null = null;
            const builder: Record<string, unknown> = {
                select: (columns: string) => {
                    if (table === 'wallet_transactions') selects.push(columns);
                    return builder;
                },
                eq: () => builder,
                in: () => builder,
                order: () => builder,
                range: (from: number, to: number) => {
                    range = [from, to];
                    return builder;
                },
                single: () => Promise.resolve({ data: { id: WALLET, resident_id: RESIDENT, balance: 0 }, error: null }),
                then: (resolve: (v: unknown) => unknown) => {
                    if (table === 'resident_wallets') return resolve({ data: walletIds.map((id) => ({ id })), error: null });
                    const [from, to] = range ?? [0, rows.length - 1];
                    const end = Math.min(to + 1, from + SERVER_MAX_ROWS);
                    return resolve({ data: rows.slice(from, end), error: null });
                },
            };
            return builder;
        },
    };
    return { client, selects };
}

/** Newest first: 1200 credits of 10 in 2025, then one 2024 credit. */
function ledger(): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < 1200; i++) {
        rows.push({
            id: `tx-${String(i).padStart(5, '0')}`,
            type: 'credit',
            amount: 10,
            balance_after: 5 + 10 * (1200 - i),
            created_at: new Date(Date.UTC(2025, 11, 31, 12) - i * 60_000).toISOString(),
        });
    }
    rows.push({ id: 'tx-old', type: 'credit', amount: 5, balance_after: 5, created_at: '2024-06-01T12:00:00Z' });
    return rows;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getYearlyWalletTransactions (#837)', () => {
    it('keeps yearly figures complete past the 1000-row cap', async () => {
        const { client } = fakeClient(ledger());
        createServerSupabaseClient.mockResolvedValue(client);

        const { data, error } = await getYearlyWalletTransactions(RESIDENT);

        expect(error).toBeNull();
        expect(data.map((y) => y.year)).toEqual([2025, 2024]);
        expect(data[0].transactions).toHaveLength(1200);
        expect(data[0].total_credits).toBe(12_000);
        expect(data[0].closing_balance).toBe(12_005);
        expect(data[1]).toMatchObject({ total_credits: 5, closing_balance: 5 });
    });

    it('selects only the columns the view renders, never *', async () => {
        const { client, selects } = fakeClient(ledger());
        createServerSupabaseClient.mockResolvedValue(client);

        await getYearlyWalletTransactions(RESIDENT);

        expect(selects.length).toBeGreaterThan(0);
        for (const columns of selects) {
            expect(columns).not.toContain('*');
            expect(columns.split(',').map((c) => c.trim()).sort()).toEqual(
                ['amount', 'balance_after', 'created_at', 'description', 'id', 'reference_id', 'reference_type', 'type', 'wallet_id']
            );
        }
    });

    it('closes each year at the sum of every wallet, one per charge category (#1189)', async () => {
        const LEVY = '44444444-4444-4444-8444-444444444444';
        const rows: Row[] = [
            { id: 'd2', wallet_id: WALLET, type: 'credit', amount: 100, balance_after: 300, created_at: '2025-03-01T12:00:00Z' },
            { id: 'l1', wallet_id: LEVY, type: 'credit', amount: 50, balance_after: 50, created_at: '2024-09-01T12:00:00Z' },
            { id: 'd1', wallet_id: WALLET, type: 'credit', amount: 200, balance_after: 200, created_at: '2024-02-01T12:00:00Z' },
        ];
        const { client } = fakeClient(rows, [WALLET, LEVY]);
        createServerSupabaseClient.mockResolvedValue(client);

        const { data } = await getYearlyWalletTransactions(RESIDENT);

        // 2025: Dues 300 + the levy wallet's 50 carried from 2024.
        expect(data.map((y) => [y.year, y.closing_balance])).toEqual([[2025, 350], [2024, 250]]);
    });
});
