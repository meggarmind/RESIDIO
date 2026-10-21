import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { getSettingValueAsService } from '@/lib/settings/service';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn() }));
vi.mock('@/lib/whatsapp/retention', () => ({ purgeWhatsAppOperationalState: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

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
    vi.mocked(purgeWhatsAppOperationalState).mockResolvedValue({ sessions: 4, processedMessages: 5, surveyResponses: 6 });
    settings({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without an authorization header and purges nothing', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(purgeWhatsAppOperationalState).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong secret and purges nothing', async () => {
    const response = await GET(request('Bearer not-the-secret-xxxxx'));
    expect(response.status).toBe(401);
    expect(purgeWhatsAppOperationalState).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with the purge counts', async () => {
    await GET(request(`Bearer ${SECRET}`));
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cron:whatsapp-retention',
        action: 'purge',
        outcome: 'success',
        summary: { sessions: 4, processedMessages: 5, surveyResponses: 6 },
      })
    );
  });

  it('purges with the configured retention days and returns the counts', async () => {
    settings({ whatsapp_session_retention_days: 5, whatsapp_processed_message_retention_days: 9 });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, sessions: 4, processedMessages: 5, surveyResponses: 6 });
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 5, processedMessageDays: 9, surveyResponseDays: 90 });
  });

  it('falls back to 1 and 2 days when the settings are unset', async () => {
    settings({ whatsapp_session_retention_days: null, whatsapp_processed_message_retention_days: null });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 1, processedMessageDays: 2, surveyResponseDays: 90 });
  });

  // Defensive: getSettingValueAsService coerces numeric strings to numbers, so
  // a non-numeric value should not reach the route in practice.
  it('defensively falls back to the defaults for a clearly non-numeric value', async () => {
    settings({ whatsapp_session_retention_days: {}, whatsapp_processed_message_retention_days: true });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 1, processedMessageDays: 2, surveyResponseDays: 90 });
  });

  // A stored '7' is coerced to the number 7 by the settings service.
  it('passes an in-range numeric value through unchanged', async () => {
    settings({ whatsapp_session_retention_days: 7, whatsapp_processed_message_retention_days: 7 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 7, processedMessageDays: 7, surveyResponseDays: 90 });
  });

  it('clamps retention days above 30 down to 30', async () => {
    settings({ whatsapp_session_retention_days: 400, whatsapp_processed_message_retention_days: 31 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 30, processedMessageDays: 30, surveyResponseDays: 90 });
  });

  it('passes the survey retention setting through and clamps it to 1..365', async () => {
    settings({ whatsapp_survey_retention_days: 120 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenLastCalledWith(expect.objectContaining({ surveyResponseDays: 120 }));
    settings({ whatsapp_survey_retention_days: 9999 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenLastCalledWith(expect.objectContaining({ surveyResponseDays: 365 }));
  });

  it('clamps retention days below 1 up to 1', async () => {
    settings({ whatsapp_session_retention_days: 0, whatsapp_processed_message_retention_days: -5 });
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeWhatsAppOperationalState).toHaveBeenCalledWith({ sessionDays: 1, processedMessageDays: 1, surveyResponseDays: 90 });
  });

  it('returns 500 with the error message when the purge throws', async () => {
    vi.mocked(purgeWhatsAppOperationalState).mockRejectedValue(new Error('db down'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'db down' });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:whatsapp-retention', outcome: 'failure', error: expect.any(Error) })
    );
  });
});
