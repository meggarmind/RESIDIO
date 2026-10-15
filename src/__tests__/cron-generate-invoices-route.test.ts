import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/generate-invoices/route';

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  getInvoiceGenerationDay: vi.fn(),
  getAutoGenerateEnabled: vi.fn(),
  findReusableInvoiceGenerationRun: vi.fn(),
  prepareInvoiceGenerationRunCore: vi.fn(),
  processInvoiceGenerationRunChunk: vi.fn(),
  activeRuns: [] as Array<{ id: string; status: string }>,
}));

vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock('@/actions/billing/get-generation-log', () => ({
  getInvoiceGenerationDay: mocks.getInvoiceGenerationDay,
  getAutoGenerateEnabled: mocks.getAutoGenerateEnabled,
}));
vi.mock('@/lib/billing/invoice-generation-run-service', () => ({
  currentMonthPeriod: () => '2026-10-01',
  findReusableInvoiceGenerationRun: mocks.findReusableInvoiceGenerationRun,
  parseInvoiceGenerationRequest: (input: unknown) => input,
  prepareInvoiceGenerationRunCore: mocks.prepareInvoiceGenerationRunCore,
}));
vi.mock('@/lib/billing/invoice-generation-worker', () => ({
  processInvoiceGenerationRunChunk: mocks.processInvoiceGenerationRunChunk,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: mocks.activeRuns, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

const request = {} as NextRequest;

function setToday(day: number) {
  vi.setSystemTime(new Date(2026, 9, day, 12, 0, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.activeRuns = [];
  mocks.verifyCronAuth.mockReturnValue(null);
  mocks.getAutoGenerateEnabled.mockResolvedValue({ data: true });
  mocks.getInvoiceGenerationDay.mockResolvedValue({ data: 5 });
  mocks.findReusableInvoiceGenerationRun.mockResolvedValue(null);
  mocks.prepareInvoiceGenerationRunCore.mockResolvedValue({ data: { id: 'run-1', candidateCount: 3 } });
  mocks.processInvoiceGenerationRunChunk.mockResolvedValue({ processed: 3, run: { status: 'completed' } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cron generate-invoices route catch-up (#638)', () => {
  it('skips before the configured day and prepares nothing', async () => {
    setToday(4);
    const body = await (await GET(request)).json();
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe('Before generation day (today: 4, configured: 5)');
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
  });

  it('prepares a conservative run on the configured day', async () => {
    setToday(5);
    const body = await (await GET(request)).json();
    expect(body.success).toBe(true);
    expect(mocks.prepareInvoiceGenerationRunCore).toHaveBeenCalledTimes(1);
    expect(mocks.prepareInvoiceGenerationRunCore.mock.calls[0][0]).toMatchObject({
      targetMonth: '2026-10-01',
      trigger: 'cron',
      walletAllocation: false,
      sendEmails: false,
      assessLateFees: false,
    });
  });

  it('catches up: prepares a run AFTER the configured day when none exists', async () => {
    setToday(17);
    const body = await (await GET(request)).json();
    expect(body.success).toBe(true);
    expect(body.prepared.runId).toBe('run-1');
    expect(mocks.prepareInvoiceGenerationRunCore).toHaveBeenCalledTimes(1);
  });

  it('does not prepare a second run after the day when a cron run already exists', async () => {
    setToday(17);
    mocks.findReusableInvoiceGenerationRun.mockResolvedValue({ id: 'run-0', status: 'completed' });
    const body = await (await GET(request)).json();
    expect(body.prepared).toMatchObject({ skipped: true, runId: 'run-0' });
    expect(mocks.findReusableInvoiceGenerationRun).toHaveBeenCalledWith('cron', '2026-10-01', { includeCancelled: true });
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
  });

  // A cancelled cron run must hold for the month: the guard ignored cancelled runs, so
  // every later daily call recreated it and billed the houses it had not reached.
  it('does not recreate a cron run an admin cancelled earlier this month', async () => {
    setToday(17);
    mocks.findReusableInvoiceGenerationRun.mockResolvedValue({ id: 'run-0', status: 'cancelled' });
    const body = await (await GET(request)).json();
    expect(body.prepared).toMatchObject({ skipped: true, runId: 'run-0', reason: 'Run for this period was cancelled' });
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
  });

  it('skips when auto-generation is disabled, even after the day', async () => {
    setToday(17);
    mocks.getAutoGenerateEnabled.mockResolvedValue({ data: false });
    const body = await (await GET(request)).json();
    expect(body).toMatchObject({ skipped: true, reason: 'Auto-generation is disabled' });
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
  });
});
