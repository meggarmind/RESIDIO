import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import {
  getDueSchedules,
  markScheduleExecuted,
  saveScheduledReport,
} from '@/lib/reports/scheduled-report-store';
import { generateReportWithClient } from '@/lib/reports/report-generator';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/reports/scheduled-report-store', () => ({
  getDueSchedules: vi.fn(),
  markScheduleExecuted: vi.fn(),
  saveScheduledReport: vi.fn(),
}));
vi.mock('@/lib/reports/report-generator', () => ({ generateReportWithClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/generate-reports', {
    headers: authorization ? { authorization } : {},
  });
}

function schedule(id: string) {
  return {
    id,
    name: `Schedule ${id}`,
    report_type: 'financial_overview',
    period_preset: 'last_month',
    bank_account_ids: [],
    include_charts: false,
    include_summary: true,
    template_style: 'standard',
    frequency: 'monthly',
    day_of_week: null,
    day_of_month: 1,
  };
}

describe('GET /api/cron/generate-reports system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(getDueSchedules).mockResolvedValue({ data: [schedule('s-1'), schedule('s-2')], error: null } as never);
    vi.mocked(generateReportWithClient).mockResolvedValue({ success: true, report: { type: 'x', data: {} } } as never);
    vi.mocked(saveScheduledReport).mockResolvedValue({ data: { id: 'r-1' }, error: null } as never);
    vi.mocked(markScheduleExecuted).mockResolvedValue(undefined as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:generate-reports',
        action: 'generate',
        outcome: 'success',
        summary: { due: 2, succeeded: 2, failed: 0, failedScheduleIds: [] },
      })
    );
  });

  it('records a run with nothing due as a success', async () => {
    vi.mocked(getDueSchedules).mockResolvedValue({ data: [], error: null } as never);
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success', summary: { due: 0 } })
    );
  });

  it('records partial with the failed schedule ids when one of two fails, and the response stays 200', async () => {
    vi.mocked(generateReportWithClient)
      .mockResolvedValueOnce({ success: true, report: { type: 'x', data: {} } } as never)
      .mockResolvedValueOnce({ success: false, error: 'bad report' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'partial',
        error: 'bad report',
        summary: expect.objectContaining({ succeeded: 1, failed: 1, failedScheduleIds: ['s-2'] }),
      })
    );
  });

  it('records failure when every schedule fails', async () => {
    vi.mocked(generateReportWithClient).mockResolvedValue({ success: false, error: 'bad report' } as never);
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });

  it('records failure with the error when due schedules cannot be fetched (500)', async () => {
    vi.mocked(getDueSchedules).mockResolvedValue({ data: null, error: 'store down' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:generate-reports', outcome: 'failure', error: 'store down' })
    );
  });
});
