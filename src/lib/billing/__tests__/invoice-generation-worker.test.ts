import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';
import { createAdminClient } from '@/lib/supabase/server';
import { queueInvoiceGeneratedEmail } from '@/lib/notifications/invoice-generation-email';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notifications/invoice-generation-email', () => ({ queueInvoiceGeneratedEmail: vi.fn() }));

const adminClientMock = vi.mocked(createAdminClient);
const queueEmailMock = vi.mocked(queueInvoiceGeneratedEmail);

const createClient = (sendEmails: boolean, rpcResults: unknown[]) => {
  const queue = [...rpcResults];
  const runChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { options: { sendEmails } }, error: null }),
  };
  const candidateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    from: vi.fn((table: string) => table === 'invoice_generation_runs' ? runChain : candidateChain),
    rpc: vi.fn().mockImplementation(async () => queue.shift() ?? { data: null, error: null }),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  queueEmailMock.mockResolvedValue({ status: 'queued', queueId: 'queue-1' });
});

describe('invoice generation worker email side effect', () => {
  it('queues email only after a created invoice RPC result', async () => {
    const client = createClient(true, [
      { data: [{ candidate_id: 'candidate-1' }], error: null },
      { data: { status: 'created', invoice_id: 'invoice-1' }, error: null },
      { data: { status: 'completed' }, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
    const result = await processInvoiceGenerationRunChunk('run-1', null);
    expect(queueEmailMock).toHaveBeenCalledWith('invoice-1', 'candidate-1');
    expect(result.outcomes[0]).toMatchObject({ email: { status: 'queued', queueId: 'queue-1' } });
    expect(client.from).toHaveBeenCalledWith('invoice_generation_candidates');
  });

  it('does not queue an email for skipped or failed invoice outcomes', async () => {
    const client = createClient(true, [
      { data: [{ candidate_id: 'candidate-1' }, { candidate_id: 'candidate-2' }], error: null },
      { data: { status: 'skipped', invoice_id: 'invoice-existing' }, error: null },
      { data: { status: 'failed', error: 'bad item' }, error: null },
      { data: { status: 'completed_with_errors' }, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
    await processInvoiceGenerationRunChunk('run-1', null);
    expect(queueEmailMock).not.toHaveBeenCalled();
  });

  it('does not queue emails when the run option is disabled', async () => {
    const client = createClient(false, [
      { data: [{ candidate_id: 'candidate-1' }], error: null },
      { data: { status: 'created', invoice_id: 'invoice-1' }, error: null },
      { data: { status: 'completed' }, error: null },
    ]);
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
    await processInvoiceGenerationRunChunk('run-1', null);
    expect(queueEmailMock).not.toHaveBeenCalled();
  });
});
