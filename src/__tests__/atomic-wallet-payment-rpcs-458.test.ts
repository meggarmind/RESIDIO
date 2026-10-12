import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logAudit = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock('@/lib/audit/logger', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => createServerSupabaseClient() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { payInvoiceWithWallet } from '@/actions/billing/pay-invoice-with-wallet';
import { payMultipleInvoicesWithWallet } from '@/actions/billing/pay-multiple-invoices-with-wallet';

const USER = 'user-1';
const INV_A = '22222222-2222-4222-8222-222222222222';
const INV_B = '44444444-4444-4444-8444-444444444444';

type Rpc = { name: string; args: Record<string, unknown> };

/** Records every table access and rpc call. Table reads are limited to the profiles lookup. */
function fakeClient(opts: {
    user?: { id: string } | null;
    residentId?: string | null;
    rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };
}) {
    const tables: Array<{ table: string; op: string }> = [];
    const rpcCalls: Rpc[] = [];
    const client = {
        auth: {
            getUser: () =>
                Promise.resolve({ data: { user: opts.user === undefined ? { id: USER } : opts.user }, error: null }),
        },
        from(table: string) {
            const builder: Record<string, unknown> = {};
            for (const op of ['select', 'eq', 'in', 'update', 'insert', 'upsert', 'delete']) {
                builder[op] = () => {
                    tables.push({ table, op });
                    return builder;
                };
            }
            builder.single = () =>
                Promise.resolve({
                    data: opts.residentId === null ? null : { resident_id: opts.residentId ?? 'res-1' },
                    error: null,
                });
            return builder;
        },
        rpc(name: string, args: Record<string, unknown>) {
            rpcCalls.push({ name, args });
            return Promise.resolve(opts.rpc ? opts.rpc(name, args) : { data: null, error: null });
        },
    };
    return { client, tables, rpcCalls };
}

const mutating = (tables: Array<{ table: string; op: string }>) =>
    tables.filter((t) => ['update', 'insert', 'upsert', 'delete'].includes(t.op));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('payInvoiceWithWallet (#458)', () => {
    const rpcOk = {
        success: true,
        amount_paid: 30,
        new_wallet_balance: 70,
        old_wallet_balance: 100,
        invoice_fully_paid: false,
        invoice_number: 'INV-1',
        old_amount_paid: 0,
        old_status: 'unpaid',
        new_amount_paid: 30,
        new_status: 'partially_paid',
    };

    it('calls pay_invoice_with_wallet and never reads or writes wallets/invoices/ledger itself', async () => {
        const { client, tables, rpcCalls } = fakeClient({ rpc: () => ({ data: rpcOk, error: null }) });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await payInvoiceWithWallet(INV_A, 30);

        expect(rpcCalls).toEqual([{ name: 'pay_invoice_with_wallet', args: { p_invoice_id: INV_A, p_amount: 30 } }]);
        expect(mutating(tables)).toEqual([]);
        expect(new Set(tables.map((t) => t.table))).toEqual(new Set(['profiles']));
        expect(result).toEqual({ success: true, amountPaid: 30, newWalletBalance: 70, invoiceFullyPaid: false, error: null });
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(logAudit.mock.calls[0][0]).toMatchObject({
            entityType: 'invoices',
            entityId: INV_A,
            oldValues: { amount_paid: 0, wallet_balance: 100 },
            newValues: { amount_paid: 30, wallet_balance: 70, payment_amount: 30 },
        });
    });

    it('passes a null amount when none is given (RPC pays min(balance, remaining))', async () => {
        const { client, rpcCalls } = fakeClient({ rpc: () => ({ data: rpcOk, error: null }) });
        createServerSupabaseClient.mockResolvedValue(client);
        await payInvoiceWithWallet(INV_A);
        expect(rpcCalls[0].args).toEqual({ p_invoice_id: INV_A, p_amount: null });
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 10.005])('rejects amount %s before any call', async (amount) => {
        const { client, rpcCalls } = fakeClient({});
        createServerSupabaseClient.mockResolvedValue(client);
        const result = await payInvoiceWithWallet(INV_A, amount);
        expect(result).toMatchObject({ success: false, error: 'Invalid payment amount' });
        expect(rpcCalls).toEqual([]);
    });

    it('requires an authenticated resident and does not gain an admin permission check', async () => {
        const anon = fakeClient({ user: null });
        createServerSupabaseClient.mockResolvedValue(anon.client);
        expect(await payInvoiceWithWallet(INV_A)).toMatchObject({ success: false, error: 'Not authenticated' });
        expect(anon.rpcCalls).toEqual([]);

        const noProfile = fakeClient({ residentId: null });
        createServerSupabaseClient.mockResolvedValue(noProfile.client);
        expect(await payInvoiceWithWallet(INV_A)).toMatchObject({ success: false, error: 'No resident profile found' });
        expect(noProfile.rpcCalls).toEqual([]);

        const src = readFileSync(new URL('../actions/billing/pay-invoice-with-wallet.ts', import.meta.url), 'utf8');
        expect(src).not.toContain('authorizePermission');
    });

    it('returns the RPC rejection without auditing', async () => {
        const { client } = fakeClient({
            rpc: () => ({ data: { success: false, error: 'Insufficient wallet balance', new_wallet_balance: 5 }, error: null }),
        });
        createServerSupabaseClient.mockResolvedValue(client);
        expect(await payInvoiceWithWallet(INV_A, 30)).toMatchObject({
            success: false,
            error: 'Insufficient wallet balance',
            newWalletBalance: 5,
        });
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('returns a thrown RPC error without auditing', async () => {
        const { client } = fakeClient({ rpc: () => ({ data: null, error: { message: 'Not authorized to pay this invoice' } }) });
        createServerSupabaseClient.mockResolvedValue(client);
        expect(await payInvoiceWithWallet(INV_A)).toMatchObject({ success: false, error: 'Not authorized to pay this invoice' });
        expect(logAudit).not.toHaveBeenCalled();
    });
});

describe('payMultipleInvoicesWithWallet (#458)', () => {
    it('sends every invoice in ONE pay_invoices_with_wallet call and does no client-side writes', async () => {
        const { client, tables, rpcCalls } = fakeClient({
            rpc: () => ({
                data: { success: true, total_paid: 80, count_paid: 2, new_wallet_balance: 20, old_wallet_balance: 100 },
                error: null,
            }),
        });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await payMultipleInvoicesWithWallet([INV_A, INV_B]);

        expect(rpcCalls).toEqual([
            { name: 'pay_invoices_with_wallet', args: { p_items: [{ invoice_id: INV_A }, { invoice_id: INV_B }] } },
        ]);
        expect(mutating(tables)).toEqual([]);
        expect(tables.some((t) => ['invoices', 'resident_wallets', 'wallet_transactions'].includes(t.table))).toBe(false);
        expect(result).toEqual({ success: true, totalPaid: 80, newWalletBalance: 20, countPaid: 2, error: null });
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ countPaid: 2, wallet_balance: 20 });
    });

    it('reports an all-or-nothing rejection with zero paid and no audit', async () => {
        const { client } = fakeClient({
            rpc: () => ({ data: { success: false, error: 'Invoice X is not payable', new_wallet_balance: 100 }, error: null }),
        });
        createServerSupabaseClient.mockResolvedValue(client);
        expect(await payMultipleInvoicesWithWallet([INV_A, INV_B])).toEqual({
            success: false,
            totalPaid: 0,
            newWalletBalance: 100,
            countPaid: 0,
            error: 'Invoice X is not payable',
        });
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects empty input and unauthenticated callers before the RPC', async () => {
        const { client, rpcCalls } = fakeClient({ user: null });
        createServerSupabaseClient.mockResolvedValue(client);
        expect(await payMultipleInvoicesWithWallet([])).toMatchObject({ error: 'No invoices selected' });
        expect(await payMultipleInvoicesWithWallet([INV_A])).toMatchObject({ error: 'Not authenticated' });
        expect(rpcCalls).toEqual([]);
    });
});

describe('static: flows hold no client-side wallet/invoice read-modify-write', () => {
    it.each([
        'pay-invoice-with-wallet.ts',
        'pay-multiple-invoices-with-wallet.ts',
        'reverse-payment-allocation.ts',
    ])('%s does not touch wallets, invoices or the ledger directly', (file) => {
        const src = readFileSync(new URL(`../actions/billing/${file}`, import.meta.url), 'utf8');
        expect(src).not.toMatch(/\.from\(['"](resident_wallets|invoices|wallet_transactions)['"]\)/);
        expect(src).not.toContain('getOrCreateWallet');
        expect(src).toContain('callWalletInvoiceRpc');
    });
});

const migration = readFileSync(
    new URL('../../supabase/migrations/20261012220000_atomic_wallet_payment_rpcs.sql', import.meta.url),
    'utf8',
);
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '');

function fn(name: string) {
    const m = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
    expect(m, `${name} must exist`).not.toBeNull();
    return stripComments(m![0]);
}

describe('static: atomic wallet payment RPC migration (#458)', () => {
    const names = ['pay_invoice_with_wallet', 'pay_invoices_with_wallet', 'reverse_invoice_payment_allocation'];

    it.each(names)('%s is SECURITY DEFINER with a pinned search_path and row locks', (name) => {
        const body = fn(name);
        expect(body).toContain('SECURITY DEFINER');
        expect(body).toContain('SET search_path = public\n');
        expect(body).toMatch(/FOR UPDATE/);
        expect(body).toContain('has_permission');
    });

    it.each(names)('%s is revoked from PUBLIC/anon and granted to authenticated + service_role only', (name) => {
        const sql = stripComments(migration);
        expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`));
        expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated, service_role;`));
        expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[^;]*(anon|PUBLIC)`));
    });

    it('locks the wallet before any invoice row lock', () => {
        for (const name of ['pay_invoice_with_wallet', 'reverse_invoice_payment_allocation']) {
            const body = fn(name);
            const wallet = body.search(/FROM public\.resident_wallets\s+WHERE resident_id = \w+\s+FOR UPDATE/);
            const invoice = body.search(/FROM public\.invoices WHERE id = p_invoice_id FOR UPDATE/);
            expect(wallet).toBeGreaterThan(-1);
            expect(invoice).toBeGreaterThan(wallet);
        }
        const multi = fn('pay_invoices_with_wallet');
        const wallet = multi.search(/FROM public\.resident_wallets\s+WHERE resident_id = \w+\s+FOR UPDATE/);
        const invoices = multi.search(/ORDER BY i\.id\s+FOR UPDATE OF i/);
        expect(wallet).toBeGreaterThan(-1);
        expect(invoices).toBeGreaterThan(wallet);
    });

    it('only owners, wallet managers and service_role may pay; only managers/service_role may reverse', () => {
        const pay = fn('pay_invoice_with_wallet');
        expect(pay).toContain("has_permission('billing.manage_wallets')");
        expect(pay).toContain("auth.role() = 'service_role'");
        expect(pay).toMatch(/profiles[\s\S]*approval_status = 'active'/);
        expect(pay).toMatch(/IS DISTINCT FROM v_resident THEN\s+RAISE EXCEPTION/);
        const multi = fn('pay_invoices_with_wallet');
        expect(multi).toContain("has_permission('billing.manage_wallets')");
        expect(multi).toMatch(/Not authorized to pay these invoices/);
        const rev = fn('reverse_invoice_payment_allocation');
        expect(rev).toMatch(/IF NOT \(public\.has_permission\('billing\.manage_wallets'\) OR auth\.role\(\) = 'service_role'\) THEN\s+RAISE EXCEPTION/);
        expect(rev).not.toContain('profiles');
    });

    it('validates amounts, payable statuses and funds', () => {
        for (const name of names) {
            const body = fn(name);
            expect(body).toContain("'NaN', 'Infinity', '-Infinity'");
            expect(body).toContain('round(');
        }
        expect(fn('pay_invoice_with_wallet')).toContain("NOT IN ('unpaid', 'partially_paid', 'overdue')");
        expect(fn('pay_invoice_with_wallet')).toContain('p_amount > v_wallet.balance');
        expect(fn('pay_invoice_with_wallet')).toContain('p_amount > v_remaining');
        const multi = fn('pay_invoices_with_wallet');
        expect(multi).toContain('v_total > v_wallet.balance');
        expect(multi).toContain("NOT IN ('unpaid', 'partially_paid', 'overdue')");
    });

    it('bulk call validates every item before the first write and tracks a running balance', () => {
        const multi = fn('pay_invoices_with_wallet');
        const firstWrite = multi.search(/UPDATE public\.invoices/);
        const totalCheck = multi.search(/IF v_total > v_wallet\.balance/);
        expect(totalCheck).toBeGreaterThan(-1);
        expect(firstWrite).toBeGreaterThan(totalCheck);
        expect(multi).toContain('v_balance := v_balance - v_pay;');
        expect(multi).toMatch(/'debit', v_pay, v_balance,/);
    });

    it('writes the ledger in the same function as the balance update, with correct balance_after', () => {
        expect(fn('pay_invoice_with_wallet')).toMatch(/'debit', v_pay, v_new_balance,/);
        expect(fn('reverse_invoice_payment_allocation')).toMatch(/'credit', p_amount, v_new_balance, 'invoice_reversal'/);
        expect(fn('reverse_invoice_payment_allocation')).toContain('v_new_balance := v_wallet.balance + p_amount;');
    });

    it('documents its rollback', () => {
        for (const name of names) {
            expect(migration).toMatch(new RegExp(`--\\s+DROP FUNCTION IF EXISTS public\\.${name}\\(`));
        }
    });
});
