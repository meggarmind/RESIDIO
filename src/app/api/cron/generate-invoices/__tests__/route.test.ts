import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { getInvoiceCronSettings } from '@/lib/billing/invoice-cron-settings';
import {
  findReusableInvoiceGenerationRun,
  prepareInvoiceGenerationRunCore,
} from '@/lib/billing/invoice-generation-run-service';
import { processInvoiceGenerationRunChunk } from '@/lib/billing/invoice-generation-worker';
import { createAdminClient } from '@/lib/supabase/server';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/billing/invoice-cron-settings', () => ({ getInvoiceCronSettings: vi.fn() }));
vi.mock('@/lib/billing/invoice-generation-run-service', () => ({
  currentMonthPeriod: () => '2026-10',
  findReusableInvoiceGenerationRun: vi.fn(),
  parseInvoiceGenerationRequest: (input: unknown) => input,
  prepareInvoiceGenerationRunCore: vi.fn(),
}));
vi.mock('@/lib/billing/invoice-generation-worker', () => ({ processInvoiceGenerationRunChunk: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/generate-invoices', {
    headers: authorization ? { authorization } : {},
  });
}

/** An admin client whose active-runs query resolves to `runs`. */
function adminWithActiveRuns(runs: Array<{ id: string; status: string }>, error: { message: string } | null = null) {
  const query = {
    select: () => query,
    in: () => query,
    order: () => query,
    limit: async () => ({ data: runs, error }),
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as never);
}

describe('GET /api/cron/generate-invoices system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(getInvoiceCronSettings).mockResolvedValue({ autoGenerate: true, generationDay: 1 } as never);
    adminWithActiveRuns([]);
    vi.mocked(findReusableInvoiceGenerationRun).mockResolvedValue(null as never);
    vi.mocked(prepareInvoiceGenerationRunCore).mockResolvedValue({
      data: { id: 'run-1', candidateCount: 40 },
      error: null,
    } as never);
    vi.mocked(processInvoiceGenerationRunChunk).mockResolvedValue({ processed: 40, run: { status: 'completed' } } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request('Bearer wrong-secret-xxxxxxxxxx'));
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with the prepared run id and counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:generate-invoices',
        action: 'generate',
        outcome: 'success',
        summary: expect.objectContaining({
          period: '2026-10',
          prepared: expect.objectContaining({ runId: 'run-1', candidates: 40, processed: 40 }),
        }),
      })
    );
  });

  it('records a skipped run when auto-generation is disabled', async () => {
    vi.mocked(getInvoiceCronSettings).mockResolvedValue({ autoGenerate: false, generationDay: 1 } as never);
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        summary: { period: '2026-10', skipped: 'auto_generation_disabled' },
      })
    );
  });

  it('records the advanced run when one was in flight', async () => {
    adminWithActiveRuns([{ id: 'run-0', status: 'processing' }]);
    vi.mocked(findReusableInvoiceGenerationRun).mockResolvedValue({ id: 'run-0', status: 'processing' } as never);
    await GET(request(`Bearer ${SECRET}`));
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry.summary).toMatchObject({ advanced: { runId: 'run-0', processed: 40 } });
  });

  it('records failure with the error when preparing the run fails (500)', async () => {
    vi.mocked(prepareInvoiceGenerationRunCore).mockResolvedValue({ data: null, error: 'prepare failed' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:generate-invoices', outcome: 'failure', error: 'prepare failed' })
    );
  });

  it('records failure when settings cannot be read, and still returns 500', async () => {
    vi.mocked(getInvoiceCronSettings).mockRejectedValue(new Error('settings down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: expect.any(Error) })
    );
  });
});
