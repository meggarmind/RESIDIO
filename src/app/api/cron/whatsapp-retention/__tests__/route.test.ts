import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { getSettingValueAsService } from '@/lib/settings/service';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';

vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn() }));
vi.mock('@/lib/whatsapp/retention', () => ({ purgeWhatsAppOperationalState: vi.fn() }));

const SECRET = 'cron-secret-for-tests';

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/whatsapp-retention', {
    headers: authorization ? { authorization } : {},
  });
}

function settings(values: Record<string, unknown>) {
  vi.mocked(getSettingValueAsService).mockImplementation(async (key: string) => values[key] as never);
}

describe('GET /api/cron/whatsapp-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(purgeWhatsAppOperationalState).mockResolvedValue({ sessions: 4, processedMessages: 5 });
    settings({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without an authorization header and purges nothing', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(purgeWhatsAppOperationalState).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong secret and purges nothing', async () => {
    const response = await GET(request('Bearer not-the-secret-xxxxx'));
    expect(response.status).toBe(401);
    expect(purgeWhatsAppOperationalState).not.toHaveBeenCalled();
  });

  it('purges with the configured retention days and returns the counts', async () => {
    settings({ whatsapp_session_retention_days: 5, whatsapp_processed_message_retention_days: 9 });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, sessions: 4, processedMessages: 5 });
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 5, processedMessageDays: 9 });
  });

  it('falls back to 1 and 2 days when the settings are unset or not numbers', async () => {
    settings({ whatsapp_session_retention_days: '7', whatsapp_processed_message_retention_days: null });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 1, processedMessageDays: 2 });
  });

  it('clamps retention days above 30 down to 30', async () => {
    settings({ whatsapp_session_retention_days: 400, whatsapp_processed_message_retention_days: 31 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 30, processedMessageDays: 30 });
  });

  it('clamps retention days below 1 up to 1', async () => {
    settings({ whatsapp_session_retention_days: 0, whatsapp_processed_message_retention_days: -5 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 1, processedMessageDays: 1 });
  });

  it('returns 500 with the error message when the purge throws', async () => {
    vi.mocked(purgeWhatsAppOperationalState).mockRejectedValue(new Error('db down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'db down' });
  });
});
