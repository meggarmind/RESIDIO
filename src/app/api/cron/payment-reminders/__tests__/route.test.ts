import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { processInvoiceReminders } from '@/lib/notifications/invoice-reminders';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/notifications/invoice-reminders', () => ({ processInvoiceReminders: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/payment-reminders', {
    headers: authorization ? { authorization } : {},
  });
}

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    processed: 6,
    sent: { email: 3, sms: 1, whatsapp: 0 },
    skipped: 2,
    failed: 0,
    errors: [],
    ...overrides,
  } as never;
}

describe('GET /api/cron/payment-reminders system log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(processInvoiceReminders).mockResolvedValue(outcome());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for an unauthenticated request', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(processInvoiceReminders).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:payment-reminders',
        action: 'send',
        outcome: 'success',
        summary: { processed: 6, sent: { email: 3, sms: 1, whatsapp: 0 }, skipped: 2, failed: 0 },
      })
    );
  });

  it('records partial when some reminders failed but others were sent', async () => {
    vi.mocked(processInvoiceReminders).mockResolvedValue(outcome({ failed: 1, errors: ['x'] }));
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('records failure when everything failed', async () => {
    vi.mocked(processInvoiceReminders).mockResolvedValue(
      outcome({ failed: 4, sent: { email: 0, sms: 0, whatsapp: 0 } })
    );
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });

  it('records failure with the error when the job throws, and still returns 500', async () => {
    vi.mocked(processInvoiceReminders).mockRejectedValue(new Error('boom'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:payment-reminders', outcome: 'failure', error: expect.any(Error) })
    );
  });
});
