import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorizePermission = vi.fn();
const logAudit = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: (...a: unknown[]) => authorizePermission(...a) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => createServerSupabaseClient() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { debitWalletForInvoice } from '@/actions/billing/wallet';
import { updateInvoiceGenerationDay, updateAutoGenerateEnabled } from '@/actions/billing/get-generation-log';
import { reversePaymentAllocation } from '@/actions/billing/reverse-payment-allocation';
import { debitWalletForInvoiceAtomic } from '@/lib/billing/wallet-invoice-debit';

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const INVOICE = '22222222-2222-4222-8222-222222222222';
const WALLET = '33333333-3333-4333-8333-333333333333';
const SETTING = '44444444-4444-4444-8444-444444444444'; // system_settings row id (audit entity_id is a uuid, #594)

type Call = { table: string; op: 'select' | 'update' | 'insert'; payload?: unknown };

/** Fake client: records every table operation and every rpc call. */
function fakeClient(opts: {
    tables?: Record<string, Record<string, unknown> | null>;
    rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };
    updateError?: Record<string, { message: string } | null>;
}) {
    const calls: Call[] = [];
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
        from(table: string) {
            let op: Call['op'] = 'select';
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                update: (payload: unknown) => {
                    op = 'update';
                    calls.push({ table, op, payload });
                    return builder;
                },
                insert: (payload: unknown) => {
                    op = 'insert';
                    calls.push({ table, op, payload });
                    return builder;
                },
                maybeSingle: () => {
                    calls.push({ table, op: 'select' });
                    return Promise.resolve({ data: opts.tables?.[table] ?? null, error: null });
                },
                single: () => {
                    calls.push({ table, op: 'select' });
                    return Promise.resolve({ data: opts.tables?.[table] ?? null, error: null });
                },
                then: (resolve: (v: unknown) => unknown) =>
                    resolve({ data: null, error: op === 'update' ? opts.updateError?.[table] ?? null : null }),
            };
            return builder;
        },
        rpc(name: string, args: Record<string, unknown>) {
            rpcCalls.push({ name, args });
            return Promise.resolve(opts.rpc ? opts.rpc(name, args) : { data: null, error: null });
        },
    };
    return { client, calls, rpcCalls };
}

const writes = (calls: Call[]) => calls.filter((c) => c.op !== 'select');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('debitWalletForInvoice', () => {
    it('rejects unauthorised callers before touching the database or audit log', async () => {
        authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

        const result = await debitWalletForInvoice(RESIDENT, INVOICE);

        expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_MANAGE_WALLETS);
        expect(result).toEqual({ success: false, amountDebited: 0, error: 'Forbidden' });
        expect(createServerSupabaseClient).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('debits through the atomic settle RPC and audits on success', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client, calls, rpcCalls } = fakeClient({
            tables: {
                resident_wallets: { id: WALLET, balance: 500 },
                invoices: { id: INVOICE, amount_due: 300, amount_paid: 0, invoice_number: 'INV-1', house_id: null },
            },
            rpc: () => ({ data: { success: true, total_allocated: 300, new_wallet_balance: 200 }, error: null }),
        });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await debitWalletForInvoice(RESIDENT, INVOICE);

        expect(result).toEqual({ success: true, amountDebited: 300, error: null });
        expect(rpcCalls).toHaveLength(1);
        expect(rpcCalls[0].name).toBe('settle_wallet_invoices');
        expect(rpcCalls[0].args).toMatchObject({ p_resident_id: RESIDENT, p_invoice_ids: [INVOICE] });
        // No client-side read-modify-write of balances or ledger.
        expect(writes(calls)).toEqual([]);
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(logAudit.mock.calls[0][0]).toMatchObject({ entityType: 'wallets', entityId: WALLET, action: 'UPDATE' });
    });

    it('does not audit when the RPC fails', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client } = fakeClient({
            tables: {
                resident_wallets: { id: WALLET, balance: 500 },
                invoices: { id: INVOICE, amount_due: 300, amount_paid: 0, invoice_number: 'INV-1', house_id: null },
            },
            rpc: () => ({ data: null, error: { message: 'boom' } }),
        });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await debitWalletForInvoice(RESIDENT, INVOICE);

        expect(result.success).toBe(false);
        expect(result.error).toBe('boom');
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects malformed ids without a database call', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const result = await debitWalletForInvoice('nope', INVOICE);
        expect(result.error).toBe('Invalid resident');
        expect(createServerSupabaseClient).not.toHaveBeenCalled();
    });
});

describe('debitWalletForInvoiceAtomic', () => {
    it('refuses an empty wallet and an already-paid invoice without calling the RPC', async () => {
        const empty = fakeClient({ tables: { resident_wallets: { id: WALLET, balance: 0 } } });
        expect((await debitWalletForInvoiceAtomic(empty.client, RESIDENT, INVOICE)).error).toBe('Insufficient wallet balance');
        expect(empty.rpcCalls).toHaveLength(0);

        const paid = fakeClient({
            tables: {
                resident_wallets: { id: WALLET, balance: 100 },
                invoices: { id: INVOICE, amount_due: 50, amount_paid: 50, invoice_number: 'INV-1', house_id: null },
            },
        });
        expect((await debitWalletForInvoiceAtomic(paid.client, RESIDENT, INVOICE)).error).toBe('Invoice already paid');
        expect(paid.rpcCalls).toHaveLength(0);
        expect(writes(paid.calls)).toEqual([]);
    });
});

describe('billing automation settings actions', () => {
    it.each([
        ['updateInvoiceGenerationDay', () => updateInvoiceGenerationDay(5)],
        ['updateAutoGenerateEnabled', () => updateAutoGenerateEnabled(false)],
    ])('%s rejects unauthorised callers with no DB write and no audit', async (_name, run) => {
        authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

        const result = await run();

        expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_MANAGE_BILLING);
        expect(result).toEqual({ success: false, error: 'Forbidden' });
        expect(createServerSupabaseClient).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('updateInvoiceGenerationDay writes and audits when authorised', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client, calls } = fakeClient({ tables: { system_settings: { id: SETTING, value: '2' } } });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await updateInvoiceGenerationDay(5);

        expect(result).toEqual({ success: true, error: null });
        expect(writes(calls)).toEqual([{ table: 'system_settings', op: 'update', payload: { value: '5' } }]);
        expect(logAudit.mock.calls[0][0]).toMatchObject({
            entityType: 'system_settings',
            entityId: SETTING,
            entityDisplay: 'invoice_generation_day',
            oldValues: { value: '2' },
            newValues: { value: 5 },
        });
    });

    it('updateInvoiceGenerationDay validates the day before writing', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const result = await updateInvoiceGenerationDay(31);
        expect(result.success).toBe(false);
        expect(createServerSupabaseClient).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('updateAutoGenerateEnabled writes and audits when authorised, and skips audit on DB error', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const ok = fakeClient({ tables: { system_settings: { id: SETTING, value: true } } });
        createServerSupabaseClient.mockResolvedValue(ok.client);
        expect(await updateAutoGenerateEnabled(false)).toEqual({ success: true, error: null });
        expect(logAudit.mock.calls[0][0]).toMatchObject({ action: 'DEACTIVATE', entityId: SETTING, entityDisplay: 'auto_generate_invoices' });

        logAudit.mockClear();
        const bad = fakeClient({ updateError: { system_settings: { message: 'denied' } } });
        createServerSupabaseClient.mockResolvedValue(bad.client);
        expect(await updateAutoGenerateEnabled(true)).toEqual({ success: false, error: 'denied' });
        expect(logAudit).not.toHaveBeenCalled();
    });
});

describe('reversePaymentAllocation atomic RPC', () => {
    const rpcOk = {
        success: true,
        new_invoice_status: 'partially_paid',
        new_amount_paid: 60,
        old_amount_paid: 100,
        old_status: 'paid',
        invoice_number: 'INV-1',
        new_wallet_balance: 90,
        old_wallet_balance: 50,
    };

    it('rejects unauthorised callers with no DB access', async () => {
        authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
        const result = await reversePaymentAllocation(INVOICE, 40);
        expect(result.success).toBe(false);
        expect(createServerSupabaseClient).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('reverses through reverse_invoice_payment_allocation with no direct writes', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client, calls, rpcCalls } = fakeClient({ rpc: () => ({ data: rpcOk, error: null }) });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await reversePaymentAllocation(INVOICE, 40);

        expect(result).toMatchObject({ success: true, amountReversed: 40, newInvoiceStatus: 'partially_paid', newWalletBalance: 90 });
        expect(rpcCalls).toEqual([
            { name: 'reverse_invoice_payment_allocation', args: { p_invoice_id: INVOICE, p_amount: 40 } },
        ]);
        expect(writes(calls)).toEqual([]);
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(logAudit.mock.calls[0][0].oldValues).toMatchObject({ amount_paid: 100, status: 'paid', wallet_balance: 50 });
        expect(logAudit.mock.calls[0][0].newValues).toMatchObject({ amount_paid: 60, wallet_balance: 90 });
    });

    it('surfaces an RPC error, writes nothing client-side and does not audit', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client, calls } = fakeClient({ rpc: () => ({ data: null, error: { message: 'boom' } }) });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await reversePaymentAllocation(INVOICE, 40);

        expect(result).toMatchObject({ success: false, amountReversed: 0, error: 'boom' });
        expect(writes(calls)).toEqual([]);
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('surfaces a validation failure returned by the RPC', async () => {
        authorizePermission.mockResolvedValue({ authorized: true });
        const { client } = fakeClient({ rpc: () => ({ data: { success: false, error: 'Cannot reverse 40.' }, error: null }) });
        createServerSupabaseClient.mockResolvedValue(client);

        const result = await reversePaymentAllocation(INVOICE, 40);

        expect(result).toMatchObject({ success: false, error: 'Cannot reverse 40.' });
        expect(logAudit).not.toHaveBeenCalled();
    });
});
