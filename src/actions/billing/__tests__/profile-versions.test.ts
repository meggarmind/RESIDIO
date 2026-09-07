import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBillingProfileVersion, updateBillingProfileVersion } from '../profile-versions';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: vi.fn(),
}));

vi.mock('@/lib/audit/logger', () => ({
    logAudit: vi.fn(),
    getChangedValues: (oldRecord: Record<string, unknown>, newRecord: Record<string, unknown>) => ({
        old: oldRecord,
        new: newRecord,
    }),
}));

interface MockResult { data: unknown; error: unknown }

interface RecordedCall { table: string; op: 'insert' | 'update' | 'delete'; payload?: unknown }

/** Every method invoked on one `.from(table)` chain, in order, with its arguments. */
interface RecordedChain { table: string; methods: Array<{ name: string; args: unknown[] }> }

/**
 * Fluent Supabase stand-in that resolves each terminal call from an ordered
 * queue. Mirrors the queue pattern in apply-late-fees.test.ts, plus `.is()` and
 * `.delete()` which this module uses.
 *
 * It records two things. `calls` carries the write payloads. `chains` carries
 * every method invoked on each chain WITH ITS ARGUMENTS -- because the filters
 * that guard a statement (`.eq('is_locked', false)`, `.is('approved_by', null)`)
 * are part of the query, not part of its result. A test that only stubs a
 * zero-row outcome proves the handling, never that the guard is there; deleting
 * the filters leaves such a test green.
 */
const createMockClient = (results: MockResult[]) => {
    const queue = [...results];
    const calls: RecordedCall[] = [];
    const chains: RecordedChain[] = [];
    const take = (): MockResult => (queue.length ? (queue.shift() as MockResult) : { data: null, error: null });

    const from = vi.fn((table: string) => {
        const record: RecordedChain = { table, methods: [] };
        chains.push(record);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {};
        const track = (name: string) => vi.fn((...args: unknown[]) => {
            record.methods.push({ name, args });
            return chain;
        });
        for (const name of ['select', 'eq', 'in', 'is', 'order', 'limit']) chain[name] = track(name);
        chain.insert = vi.fn((payload: unknown) => { record.methods.push({ name: 'insert', args: [payload] }); calls.push({ table, op: 'insert', payload }); return chain; });
        chain.update = vi.fn((payload: unknown) => { record.methods.push({ name: 'update', args: [payload] }); calls.push({ table, op: 'update', payload }); return chain; });
        chain.delete = vi.fn(() => { record.methods.push({ name: 'delete', args: [] }); calls.push({ table, op: 'delete' }); return chain; });
        chain.single = vi.fn(async () => { record.methods.push({ name: 'single', args: [] }); return take(); });
        chain.maybeSingle = vi.fn(async () => { record.methods.push({ name: 'maybeSingle', args: [] }); return take(); });
        chain.then = (onFulfilled: (value: MockResult) => unknown, onRejected?: (reason: unknown) => unknown) => {
            record.methods.push({ name: 'then', args: [] });
            return Promise.resolve(take()).then(onFulfilled, onRejected);
        };
        return chain;
    });

    return { client: { from } as unknown as ReturnType<typeof createAdminClient>, calls, chains, from };
};

/** Arguments of every call to `method` on one chain, e.g. `[['id', 'x'], ['is_locked', false]]`. */
const argsOf = (chain: RecordedChain, method: string): unknown[][] =>
    chain.methods.filter((entry) => entry.name === method).map((entry) => entry.args);

const hasFilter = (chain: RecordedChain, method: string, column: string, value: unknown): boolean =>
    argsOf(chain, method).some(([col, val]) => col === column && val === value);

/** The chain that issued the guarded UPDATE against the version row. */
const updateChainOf = (chains: RecordedChain[]): RecordedChain | undefined =>
    chains.find((chain) => chain.table === 'billing_profile_versions' && chain.methods.some((entry) => entry.name === 'update'));

/**
 * The lock re-check that must sit between the version UPDATE and the item
 * writes: a read of `billing_profile_versions` carrying the immutability
 * filters and issuing no update of its own.
 */
const itemWriteGuardChainOf = (chains: RecordedChain[]): RecordedChain | undefined =>
    chains.find((chain) =>
        chain.table === 'billing_profile_versions'
        && !chain.methods.some((entry) => entry.name === 'update')
        && hasFilter(chain, 'eq', 'is_locked', false)
        && hasFilter(chain, 'is', 'approved_by', null));

const authorizeMock = vi.mocked(authorizePermission);
const adminClientMock = vi.mocked(createAdminClient);
const auditMock = vi.mocked(logAudit);

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

const authorized = {
    authorized: true,
    userId: 'user-1',
    roleName: 'super_admin' as const,
    roleId: 'role-1',
    permissions: ['billing.manage_profile_versions'],
    error: null,
};

const unauthorized = {
    authorized: false,
    userId: 'user-2',
    roleName: 'secretary' as const,
    roleId: 'role-2',
    permissions: [],
    error: 'Unauthorized: Missing permission billing.manage_profile_versions',
};

const profileRow = {
    id: PROFILE_ID,
    name: 'Standard 3-Bed Rate',
    description: null,
    target_type: 'house',
    applicable_roles: null,
    is_one_time: false,
    is_development_levy: false,
};

const versionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: VERSION_ID,
    billing_profile_id: PROFILE_ID,
    effective_from: '2026-02-01',
    profile_snapshot: {},
    created_by: 'user-1',
    approved_by: null,
    approved_at: null,
    is_locked: false,
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
    items: [{ id: 'item-1', name: 'Security Dues', amount: 10000, frequency: 'monthly', is_mandatory: true, item_snapshot: {} }],
    ...overrides,
});

const historicalInput = {
    billing_profile_id: PROFILE_ID,
    effective_from: '2026-02-01',
    items: [{ name: 'Security Dues', amount: 10000, frequency: 'monthly' as const, is_mandatory: true }],
};

beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue(authorized);
});

describe('createBillingProfileVersion', () => {
    it('writes a version with a historical effective_from and its items', async () => {
        const mock = createMockClient([
            { data: profileRow, error: null },          // load profile
            { data: null, error: null },                // uniqueness probe: no clash
            { data: { id: VERSION_ID }, error: null },  // insert version
            { data: null, error: null },                // insert items
            { data: versionRow(), error: null },        // read back
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await createBillingProfileVersion(historicalInput);

        expect(result.error).toBeNull();
        expect(result.data?.effective_from).toBe('2026-02-01');

        const versionInsert = mock.calls.find((call) => call.table === 'billing_profile_versions' && call.op === 'insert');
        expect(versionInsert?.payload).toMatchObject({
            billing_profile_id: PROFILE_ID,
            effective_from: '2026-02-01',
            created_by: 'user-1',
        });

        const itemInsert = mock.calls.find((call) => call.table === 'billing_profile_version_items' && call.op === 'insert');
        expect(itemInsert?.payload).toEqual([
            expect.objectContaining({ billing_profile_version_id: VERSION_ID, name: 'Security Dues', amount: 10000, frequency: 'monthly' }),
        ]);
    });

    it('writes an audit record naming the new version', async () => {
        const mock = createMockClient([
            { data: profileRow, error: null },
            { data: null, error: null },
            { data: { id: VERSION_ID }, error: null },
            { data: null, error: null },
            { data: versionRow(), error: null },
        ]);
        adminClientMock.mockReturnValue(mock.client);

        await createBillingProfileVersion(historicalInput);

        expect(auditMock).toHaveBeenCalledTimes(1);
        expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
            action: 'CREATE',
            entityType: 'billing_profile_versions',
            entityId: VERSION_ID,
        }));
    });

    it('refuses a caller without billing.manage_profile_versions and writes nothing', async () => {
        authorizeMock.mockResolvedValue(unauthorized);
        const mock = createMockClient([]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await createBillingProfileVersion(historicalInput);

        expect(result.data).toBeNull();
        expect(result.error).toBe(unauthorized.error);
        expect(mock.from).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('rejects an effective_from that is not month-truncated before reaching the database', async () => {
        const mock = createMockClient([]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await createBillingProfileVersion({ ...historicalInput, effective_from: '2026-02-15' });

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/first day of a month/i);
        expect(mock.from).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('rejects a second version for a month the profile already covers', async () => {
        const mock = createMockClient([
            { data: profileRow, error: null },
            { data: { id: 'existing-version' }, error: null },
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await createBillingProfileVersion(historicalInput);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/already exists for 2026-02/);
        expect(mock.calls.some((call) => call.op === 'insert')).toBe(false);
        expect(auditMock).not.toHaveBeenCalled();
    });
});

describe('updateBillingProfileVersion', () => {
    const itemEdit = { items: [{ name: 'Security Dues', amount: 12000, frequency: 'monthly' as const, is_mandatory: true }] };

    it('refuses to mutate a locked version', async () => {
        const mock = createMockClient([{ data: versionRow({ is_locked: true }), error: null }]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/locked/i);
        expect(result.error).toMatch(/create a new version/i);
        expect(mock.calls.some((call) => call.op === 'update' || call.op === 'insert' || call.op === 'delete')).toBe(false);
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('refuses to mutate an approved version', async () => {
        const mock = createMockClient([
            { data: versionRow({ approved_by: 'approver-1', approved_at: '2026-09-01T00:00:00.000Z' }), error: null },
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/approved/i);
        expect(mock.calls.some((call) => call.op === 'update' || call.op === 'insert' || call.op === 'delete')).toBe(false);
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('refuses a caller without billing.manage_profile_versions', async () => {
        authorizeMock.mockResolvedValue(unauthorized);
        const mock = createMockClient([]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.error).toBe(unauthorized.error);
        expect(mock.from).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    /** load existing -> guarded update -> lock re-check -> delete items -> insert items -> read back */
    const successQueue = (existing = versionRow()) => [
        { data: existing, error: null },
        { data: [{ id: VERSION_ID }], error: null },
        { data: { id: VERSION_ID }, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: versionRow(), error: null },
    ];

    it('replaces the items of an unlocked, unapproved version and audits it', async () => {
        const mock = createMockClient(successQueue());
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.error).toBeNull();
        expect(mock.calls.some((call) => call.table === 'billing_profile_version_items' && call.op === 'delete')).toBe(true);
        expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
            action: 'UPDATE',
            entityType: 'billing_profile_versions',
            entityId: VERSION_ID,
        }));
    });

    // D1: the filters that stop a lock landing between the read and the write
    // are part of the query. Asserting on a stubbed zero-row result proves only
    // that the outcome is handled -- deleting the filters leaves that green.
    it('carries the immutability filters on the UPDATE query itself', async () => {
        const mock = createMockClient(successQueue());
        adminClientMock.mockReturnValue(mock.client);

        await updateBillingProfileVersion(VERSION_ID, itemEdit);

        const updateChain = updateChainOf(mock.chains);
        expect(updateChain, 'no UPDATE was issued against billing_profile_versions').toBeDefined();
        expect(argsOf(updateChain!, 'eq')).toContainEqual(['id', VERSION_ID]);
        expect(argsOf(updateChain!, 'eq')).toContainEqual(['is_locked', false]);
        expect(argsOf(updateChain!, 'is')).toContainEqual(['approved_by', null]);
    });

    // D2: `effective_from` decides what a backfilled invoice charges, and #268
    // makes those invoice numbers permanent. Assert the payload, not the result.
    it('stamps exactly the requested effective_from on the UPDATE payload', async () => {
        const mock = createMockClient([
            { data: versionRow(), error: null },          // load existing
            { data: null, error: null },                  // uniqueness probe: no clash
            { data: [{ id: VERSION_ID }], error: null },  // guarded update
            { data: versionRow(), error: null },          // read back
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, { effective_from: '2026-03-01' });

        expect(result.error).toBeNull();
        const updatePayload = mock.calls.find((call) => call.op === 'update')?.payload as Record<string, unknown>;
        expect(updatePayload.effective_from).toBe('2026-03-01');
    });

    it('leaves effective_from out of the UPDATE payload entirely on an item-only edit', async () => {
        const mock = createMockClient(successQueue());
        adminClientMock.mockReturnValue(mock.client);

        await updateBillingProfileVersion(VERSION_ID, itemEdit);

        const updatePayload = mock.calls.find((call) => call.op === 'update')?.payload as Record<string, unknown>;
        expect(updatePayload).toBeDefined();
        expect(Object.keys(updatePayload)).toEqual(['updated_at']);
        expect(updatePayload).not.toHaveProperty('effective_from');
    });

    // D3: the guarded UPDATE protects the version row only. The item delete and
    // insert are separate statements against a separate table, and the items
    // carry the amounts -- so the lock has to be re-asserted before them too.
    it('re-asserts the lock in a query of its own before writing any item', async () => {
        const mock = createMockClient(successQueue());
        adminClientMock.mockReturnValue(mock.client);

        await updateBillingProfileVersion(VERSION_ID, itemEdit);

        const guardChain = itemWriteGuardChainOf(mock.chains);
        expect(guardChain, 'no lock re-check was issued before the item write').toBeDefined();
        expect(argsOf(guardChain!, 'eq')).toContainEqual(['id', VERSION_ID]);

        // ...and it has to come BEFORE the items are touched, not after.
        const guardIndex = mock.chains.indexOf(guardChain!);
        const itemChainIndex = mock.chains.findIndex((chain) => chain.table === 'billing_profile_version_items');
        expect(itemChainIndex).toBeGreaterThan(-1);
        expect(guardIndex).toBeLessThan(itemChainIndex);
    });

    it('writes no item when the version is locked between the version UPDATE and the item write', async () => {
        const mock = createMockClient([
            { data: versionRow(), error: null },          // load existing: unlocked
            { data: [{ id: VERSION_ID }], error: null },  // guarded update succeeded
            { data: null, error: null },                  // lock re-check: locked in the meantime
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/rate items were left unchanged/i);
        expect(mock.calls.some((call) => call.table === 'billing_profile_version_items')).toBe(false);
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('refuses when the guarded update matches no row, because the version was locked mid-edit', async () => {
        const mock = createMockClient([
            { data: versionRow(), error: null },  // read said unlocked
            { data: [], error: null },            // guarded update matched nothing
        ]);
        adminClientMock.mockReturnValue(mock.client);

        const result = await updateBillingProfileVersion(VERSION_ID, itemEdit);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/locked or approved while being edited/i);
        expect(auditMock).not.toHaveBeenCalled();
    });
});
