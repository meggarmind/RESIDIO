import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/generate-invoices/route';

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  getInvoiceCronSettings: vi.fn(),
  findReusableInvoiceGenerationRun: vi.fn(),
  prepareInvoiceGenerationRunCore: vi.fn(),
  processInvoiceGenerationRunChunk: vi.fn(),
  activeRuns: [] as Array<{ id: string; status: string }>,
}));

vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock('@/lib/billing/invoice-cron-settings', () => ({
  getInvoiceCronSettings: mocks.getInvoiceCronSettings,
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
  mocks.getInvoiceCronSettings.mockResolvedValue({ autoGenerate: true, generationDay: 5 });
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
    mocks.getInvoiceCronSettings.mockResolvedValue({ autoGenerate: false, generationDay: 5 });
    const body = await (await GET(request)).json();
    expect(body).toMatchObject({ skipped: true, reason: 'Auto-generation is disabled' });
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
    expect(mocks.processInvoiceGenerationRunChunk).not.toHaveBeenCalled();
  });

  it('honours a configured day of 10 (skips on 9, prepares on 10)', async () => {
    mocks.getInvoiceCronSettings.mockResolvedValue({ autoGenerate: true, generationDay: 10 });
    setToday(9);
    const before = await (await GET(request)).json();
    expect(before.reason).toBe('Before generation day (today: 9, configured: 10)');
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
    setToday(10);
    const on = await (await GET(request)).json();
    expect(on.success).toBe(true);
    expect(mocks.prepareInvoiceGenerationRunCore).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and prepares nothing when the settings cannot be read (fail closed)', async () => {
    setToday(17);
    mocks.getInvoiceCronSettings.mockRejectedValue(new Error('settings unreadable'));
    const res = await GET(request);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('settings unreadable');
    expect(mocks.prepareInvoiceGenerationRunCore).not.toHaveBeenCalled();
    expect(mocks.processInvoiceGenerationRunChunk).not.toHaveBeenCalled();
  });

  // The bug (#641): session-scoped actions in a cron path read zero rows and returned defaults.
  it('does not import the session-scoped billing actions', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/cron/generate-invoices/route.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/@\/actions\/billing\/get-generation-log/);
  });
});
