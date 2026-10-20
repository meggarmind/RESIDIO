import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { refreshPaymentCadenceSummary } from '@/lib/analytics/refresh-payment-cadence-summary';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/analytics/refresh-payment-cadence-summary', () => ({
  refreshPaymentCadenceSummary: vi.fn(),
}));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/refresh-payment-cadence', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/refresh-payment-cadence system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(refreshPaymentCadenceSummary).mockResolvedValue({ data: { rowsUpserted: 12 }, error: null } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request('Bearer wrong-secret-xxxxxxxxxx'));
    expect(response.status).toBe(401);
    expect(refreshPaymentCadenceSummary).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with what the refresh returned', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:refresh-payment-cadence',
        action: 'refresh',
        outcome: 'success',
        summary: { rowsUpserted: 12 },
      })
    );
  });

  it('records failure with the error when the refresh reports one (500)', async () => {
    vi.mocked(refreshPaymentCadenceSummary).mockResolvedValue({ data: null, error: 'rpc failed' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:refresh-payment-cadence', outcome: 'failure', error: 'rpc failed' })
    );
  });

  it('records failure when the refresh throws', async () => {
    vi.mocked(refreshPaymentCadenceSummary).mockRejectedValue(new Error('boom'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', error: expect.any(Error) })
    );
  });
});
