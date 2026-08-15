import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    approveInvoiceGenerationRun,
    cancelInvoiceGenerationRun,
    prepareInvoiceGenerationRun,
    retryFailedInvoiceGenerationCandidates,
} from '../invoice-generation-runs';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { prepareInvoiceGenerationRunCore } from '@/lib/billing/invoice-generation-run-service';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: vi.fn(),
}));

vi.mock('@/lib/auth/action-roles', () => ({
    PERMISSIONS: {
        BILLING_CREATE_INVOICE: 'billing.create_invoice',
        BILLING_VIEW: 'billing.view',
    },
}));

vi.mock('@/lib/audit/logger', () => ({
    logAudit: vi.fn(),
}));

vi.mock('@/lib/billing/invoice-generation-run-service', () => ({
    prepareInvoiceGenerationRunCore: vi.fn(),
}));

interface MockResult { data: unknown; error: unknown }

interface FluentQuery {
    select: (value?: unknown) => FluentQuery;
    eq: (column?: unknown, value?: unknown) => FluentQuery;
    in: (column?: unknown, value?: unknown) => FluentQuery;
    neq: (column?: unknown, value?: unknown) => FluentQuery;
    update: (values?: unknown) => FluentQuery;
    insert: (values?: unknown) => FluentQuery;
    delete: () => FluentQuery;
    order: (column?: unknown, options?: unknown) => FluentQuery;
    limit: (count?: unknown) => FluentQuery;
    single: () => Promise<MockResult>;
    maybeSingle: () => Promise<MockResult>;
    then: (onFulfilled: (result: MockResult) => unknown, onRejected?: (error: unknown) => unknown) => Promise<unknown>;
}

interface MockClient {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
}

const createMockClient = (results: MockResult[]): { client: MockClient; chains: FluentQuery[] } => {
    const queue = [...results];
    const take = (): MockResult => (queue.length ? queue.shift() as MockResult : { data: null, error: null });
    const chains: FluentQuery[] = [];
    const makeChain = (): FluentQuery => {
        const chain = {} as FluentQuery;
        const fluent = vi.fn().mockReturnValue(chain);
        chain.select = fluent;
        chain.eq = fluent;
        chain.in = fluent;
        chain.neq = fluent;
        chain.update = fluent;
        chain.insert = fluent;
        chain.delete = vi.fn().mockReturnValue(chain);
        chain.order = fluent;
        chain.limit = fluent;
        chain.single = vi.fn().mockImplementation(async () => take());
        chain.maybeSingle = chain.single;
        chain.then = (onFulfilled, onRejected) => Promise.resolve(take()).then(onFulfilled, onRejected);
        return chain;
    };
    const client: MockClient = {
        from: vi.fn().mockImplementation(() => {
            const chain = makeChain();
            chains.push(chain);
            return chain;
        }),
        rpc: vi.fn().mockImplementation(async () => take()),
    };
    return { client, chains };
};

const authorizeMock = vi.mocked(authorizePermission);
const coreMock = vi.mocked(prepareInvoiceGenerationRunCore);
const adminClientMock = vi.mocked(createAdminClient);
const auditMock = vi.mocked(logAudit);

const validRequest = { mode: 'selected_month' as const, targetMonth: '2026-08-01', trigger: 'manual' as const };

const authorized = (userId: string | null, error: string | null = null) =>
  ({ authorized: !error, userId, role: null, roleName: null, roleId: null, permissions: [], error });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('prepareInvoiceGenerationRun authorization', () => {
    it('bails without preparing when the caller lacks permission', async () => {
        authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized: Missing permission'));
        const result = await prepareInvoiceGenerationRun(validRequest);
        expect(result.data).toBeNull();
        expect(result.error).toContain('Unauthorized');
        expect(coreMock).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    it('prepares via the service core and audits when authorized', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        coreMock.mockResolvedValue({
            data: { id: 'run-1', status: 'queued', totalAmount: 5000, candidateCount: 2, skipReasons: [] },
            error: null,
        });
        const result = await prepareInvoiceGenerationRun(validRequest);
        expect(result.data).toEqual({ id: 'run-1', total_amount: 5000, status: 'queued' });
        expect(coreMock).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', targetMonth: '2026-08-01' }), 'user-1');
        expect(auditMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces prepare failures without auditing', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        coreMock.mockResolvedValue({ data: null, error: 'Could not load billing profiles' });
        const result = await prepareInvoiceGenerationRun(validRequest);
        expect(result.data).toBeNull();
        expect(result.error).toBe('Could not load billing profiles');
        expect(auditMock).not.toHaveBeenCalled();
    });
});

describe('approveInvoiceGenerationRun authorization', () => {
    it('bails without an RPC call when unauthorized', async () => {
        authorizeMock.mockResolvedValue(authorized(null, 'Unauthorized'));
        const result = await approveInvoiceGenerationRun('123e4567-e89b-12d3-a456-426614174000', 'APPROVE');
        expect(result.data).toBeNull();
        expect(result.error).toBeTruthy();
    });

    it('calls the approval RPC and audits the approval', async () => {
        authorizeMock.mockResolvedValue(authorized('user-2'));
        const { client } = createMockClient([
            { data: { approval_id: 'approval-1', run: { id: 'run-1', status: 'queued' } }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        const result = await approveInvoiceGenerationRun('123e4567-e89b-12d3-a456-426614174000', 'APPROVE 2026-08');
        expect(result.data).toEqual({ id: 'run-1', status: 'queued' });
        expect(client.rpc).toHaveBeenCalledWith('approve_invoice_generation_run', expect.objectContaining({ p_approver_id: 'user-2' }));
        expect(auditMock).toHaveBeenCalledTimes(1);
    });
});

describe('cancelInvoiceGenerationRun state transitions', () => {
    const runId = '123e4567-e89b-12d3-a456-426614174000';

    it('refuses to cancel a run outside queued or processing', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        const { client, chains } = createMockClient([
            { data: { id: runId, status: 'completed', failed_count: 0 }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        const result = await cancelInvoiceGenerationRun(runId);
        expect(result.error).toBe('Only queued or processing runs can be cancelled');
        expect(chains.length).toBe(1);
    });

    it('cancels only pending candidates and marks the run cancelled', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        const { client, chains } = createMockClient([
            { data: { id: runId, status: 'queued', failed_count: 0 }, error: null },
            { data: null, error: null },
            { data: { id: runId, status: 'cancelled' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        const result = await cancelInvoiceGenerationRun(runId);
        expect(result.data).toMatchObject({ status: 'cancelled' });
        expect(client.from).toHaveBeenCalledWith('invoice_generation_candidates');
        const candidateChain = chains[1];
        expect(candidateChain.update).toHaveBeenCalledWith({ status: 'cancelled' });
        expect(candidateChain.eq).toHaveBeenCalledWith('status', 'pending');
        const runChain = chains[2];
        expect(runChain.update).toHaveBeenCalledWith({ status: 'cancelled' });
        expect(auditMock).toHaveBeenCalledTimes(1);
    });
});

describe('retryFailedInvoiceGenerationCandidates state transitions', () => {
    const runId = '123e4567-e89b-12d3-a456-426614174000';

    it('refuses to retry a run that is not completed with errors', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        const { client } = createMockClient([
            { data: { id: runId, status: 'completed', failed_count: 0 }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        const result = await retryFailedInvoiceGenerationCandidates(runId);
        expect(result.error).toBe('Only completed error runs with failed candidates can be retried');
    });

    it('requeues only failed candidates and puts the run back in queued', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        const { client, chains } = createMockClient([
            { data: { id: runId, status: 'completed_with_errors', failed_count: 2 }, error: null },
            { data: [{ id: 'candidate-1' }, { id: 'candidate-2' }], error: null },
            { data: { id: runId, status: 'queued' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        const result = await retryFailedInvoiceGenerationCandidates(runId);
        expect(result.data).toMatchObject({ status: 'queued' });
        const candidateChain = chains[1];
        expect(candidateChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', error_message: null }));
        expect(candidateChain.eq).toHaveBeenCalledWith('status', 'failed');
        const runChain = chains[2];
        expect(runChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }));
        expect(auditMock).toHaveBeenCalledTimes(1);
    });

    it('scopes retries to selected candidate ids when provided', async () => {
        authorizeMock.mockResolvedValue(authorized('user-1'));
        const { client, chains } = createMockClient([
            { data: { id: runId, status: 'completed_with_errors', failed_count: 2 }, error: null },
            { data: [{ id: 'candidate-1' }], error: null },
            { data: { id: runId, status: 'queued' }, error: null },
        ]);
        adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
        await retryFailedInvoiceGenerationCandidates(runId, ['223e4567-e89b-12d3-a456-426614174001']);
        const candidateChain = chains[1];
        expect(candidateChain.in).toHaveBeenCalledWith('id', ['223e4567-e89b-12d3-a456-426614174001']);
    });
});
