import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #483: the report cron paths have no session, so the session-gated generateReport
 * always returned unauthorized for them. The generators now live in
 * src/lib/reports/report-generator.ts (no directive, no authorization); the cron paths call
 * generateReportWithClient(createAdminClient(), ...). Interactive generateReport keeps its gate.
 */

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  generateReportWithClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));

function path(relativePath: string): URL {
  return new URL(`../${relativePath}`, import.meta.url);
}
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(path(relativePath)), 'utf8');
}

const USE_SERVER = /^\s*['"]use server['"]/m;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('source-level invariants (#483)', () => {
  it('report-generator.ts and process-schedules.ts are not server-action modules', () => {
    expect(read('lib/reports/report-generator.ts')).not.toMatch(USE_SERVER);
    expect(read('lib/reports/process-schedules.ts')).not.toMatch(USE_SERVER);
  });

  it('report-generator.ts performs no authorization', () => {
    const src = read('lib/reports/report-generator.ts');
    expect(src).not.toContain('authorizePermission');
    expect(src).not.toContain('checkReportAccess');
  });

  it('no file under actions/reports exports processDueSchedules', () => {
    const dir = fileURLToPath(path('actions/reports'));
    for (const file of readdirSync(dir).filter((f) => /\.tsx?$/.test(f))) {
      expect(read(`actions/reports/${file}`), file).not.toMatch(/export[^;]*processDueSchedules/);
    }
  });

  // The generator takes any client and checks nothing. A one-line re-export from a
  // 'use server' module would publish it as a client-callable endpoint.
  it('no server-action module under actions/ exposes generateReportWithClient', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = `${dir}/${name}`;
        return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
      });
    for (const file of walk(fileURLToPath(path('actions')))) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/export[^;]*generateReportWithClient/);
      // Only erased `export type { ... } from` re-exports may point at the generator module.
      expect(src, file).not.toMatch(/export\s+(?!type)(\*|\{[^}]*\})\s+from\s+['"]@\/lib\/reports\/report-generator['"]/);
    }
  });

  it('report-engine.ts stays a server-action module that gates on checkReportAccess', () => {
    const src = read('actions/reports/report-engine.ts');
    expect(src).toMatch(USE_SERVER);
    expect(src).toContain('checkReportAccess()');
  });
});

describe('generateReportWithClient', () => {
  it('does not call authorizePermission and never touches the session client', async () => {
    const { generateReportWithClient } = await import('@/lib/reports/report-generator');
    const result = await generateReportWithClient(
      {} as never,
      { reportType: 'nope', periodPreset: 'last_month' } as never
    );
    expect(result).toEqual({ success: false, error: 'Invalid report type' });
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('runs a generator against the supplied client without authorizing', async () => {
    const { generateReportWithClient } = await import('@/lib/reports/report-generator');
    const from = vi.fn(() => {
      throw new Error('stub client reached');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await generateReportWithClient(
      { from } as never,
      { reportType: 'invoice_aging', periodPreset: 'last_month' } as never
    );
    spy.mockRestore();
    expect(from).toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'stub client reached' });
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
  });
});

describe('generateReport (interactive)', () => {
  it('returns the unauthorized error and does not generate when authorization fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/reports/report-generator', () => ({
      generateReportWithClient: mocks.generateReportWithClient,
    }));
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    mocks.createServerSupabaseClient.mockResolvedValue({});
    const { generateReport } = await import('@/actions/reports/report-engine');
    const result = await generateReport({ reportType: 'invoice_aging', periodPreset: 'last_month' } as never);
    expect(result).toEqual({ success: false, error: 'Forbidden' });
    expect(mocks.generateReportWithClient).not.toHaveBeenCalled();
    vi.doUnmock('@/lib/reports/report-generator');
  });

  it('delegates to the generator with the session client when authorized', async () => {
    vi.resetModules();
    vi.doMock('@/lib/reports/report-generator', () => ({
      generateReportWithClient: mocks.generateReportWithClient,
    }));
    const sessionClient = { session: true };
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    mocks.createServerSupabaseClient.mockResolvedValue(sessionClient);
    mocks.generateReportWithClient.mockResolvedValue({ success: true });
    const { generateReport } = await import('@/actions/reports/report-engine');
    const params = { reportType: 'invoice_aging', periodPreset: 'last_month' } as never;
    await generateReport(params);
    expect(mocks.generateReportWithClient).toHaveBeenCalledWith(sessionClient, params);
    vi.doUnmock('@/lib/reports/report-generator');
  });
});

describe('/api/cron/generate-reports', () => {
  it('generates with the admin client, not the session-gated action', async () => {
    vi.resetModules();
    const adminClient = { admin: true };
    mocks.createAdminClient.mockReturnValue(adminClient);
    mocks.generateReportWithClient.mockResolvedValue({
      success: true,
      report: { type: 'invoice_aging', data: {} },
    });
    vi.doMock('@/lib/reports/report-generator', () => ({
      generateReportWithClient: mocks.generateReportWithClient,
    }));
    vi.doMock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: () => null }));
    vi.doMock('@/lib/reports/scheduled-report-store', () => ({
      getDueSchedules: async () => ({
        data: [
          {
            id: 's1',
            name: 'Aging',
            report_type: 'invoice_aging',
            period_preset: 'last_month',
            frequency: 'monthly',
            bank_account_ids: [],
            include_charts: false,
            include_summary: true,
          },
        ],
        error: null,
      }),
      saveScheduledReport: async () => ({ data: { id: 'r1' }, error: null }),
      markScheduleExecuted: async () => undefined,
    }));
    const { GET } = await import('@/app/api/cron/generate-reports/route');
    const res = await GET({} as never);
    const body = await res.json();
    expect(body.succeeded).toBe(1);
    expect(mocks.generateReportWithClient).toHaveBeenCalledTimes(1);
    expect(mocks.generateReportWithClient.mock.calls[0][0]).toBe(adminClient);
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
    vi.doUnmock('@/lib/reports/report-generator');
    vi.doUnmock('@/lib/auth/cron-auth');
    vi.doUnmock('@/lib/reports/scheduled-report-store');
  });
});

describe('processDueSchedules (/api/cron/process-report-schedules)', () => {
  it('generates with the admin client and does not authorize', async () => {
    vi.resetModules();
    const adminClient: Record<string, unknown> = {};
    const schedule = {
      id: 's1',
      report_type: 'invoice_aging',
      period_preset: 'last_month',
      frequency: 'monthly',
      bank_account_ids: [],
      recipients: [],
      configuration: {},
    };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    adminClient.from = () => chain;
    mocks.createAdminClient.mockReturnValue(adminClient);
    mocks.generateReportWithClient.mockResolvedValue({ success: false, error: 'stop here' });
    vi.doMock('@/lib/reports/report-generator', () => ({
      generateReportWithClient: mocks.generateReportWithClient,
    }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn() }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn() }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    const result = await processDueSchedules();
    expect(result.failed).toBe(1);
    expect(mocks.generateReportWithClient).toHaveBeenCalledTimes(1);
    expect(mocks.generateReportWithClient.mock.calls[0][0]).toBe(adminClient);
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
    vi.doUnmock('@/lib/reports/report-generator');
    vi.doUnmock('@/lib/pdf/reports/renderer');
    vi.doUnmock('@/lib/email/send-email');
    vi.doUnmock('@/lib/audit/logger');
  });
});
