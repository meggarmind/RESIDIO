import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { processDueSchedules } from '@/lib/reports/process-schedules';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/reports/process-schedules', () => ({ processDueSchedules: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/process-report-schedules', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/process-report-schedules system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(processDueSchedules).mockResolvedValue({ processed: 3, failed: 0, errors: [] });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(processDueSchedules).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:process-report-schedules',
        action: 'process',
        outcome: 'success',
        summary: { processed: 3, failed: 0, errorCount: 0 },
      })
    );
  });

  it('records partial when some schedules failed', async () => {
    vi.mocked(processDueSchedules).mockResolvedValue({ processed: 3, failed: 1, errors: ['x'] });
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('records partial for 1 success and 2 failures (processed counts successes only)', async () => {
    vi.mocked(processDueSchedules).mockResolvedValue({ processed: 1, failed: 2, errors: ['x', 'y'] });
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('records failure when every schedule failed', async () => {
    vi.mocked(processDueSchedules).mockResolvedValue({ processed: 0, failed: 2, errors: ['x', 'y'] });
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });

  it('records failure when the schedule query itself failed (nothing processed, one error)', async () => {
    vi.mocked(processDueSchedules).mockResolvedValue({ processed: 0, failed: 0, errors: ['relation missing'] });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
        error: 'relation missing',
        summary: { processed: 0, failed: 0, errorCount: 1 },
      })
    );
  });

  it('records failure with the error when processing throws, and still returns 500', async () => {
    vi.mocked(processDueSchedules).mockRejectedValue(new Error('boom'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:process-report-schedules', outcome: 'failure', error: expect.any(Error) })
    );
  });
});
