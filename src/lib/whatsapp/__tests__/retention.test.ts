import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-13T12:00:00.000Z');
const PURGEABLE = ['whatsapp_sessions', 'whatsapp_processed_messages', 'whatsapp_survey_responses'];

type Result = { count: number | null; error: unknown };

function setup(results: Record<string, Result> = {}) {
  const queries: Record<string, { delete: ReturnType<typeof vi.fn>; lt: ReturnType<typeof vi.fn> }> = {};
  const from = vi.fn().mockImplementation((table: string) => {
    // Unknown tables throw, so touching a protected table fails the test
    // loudly rather than being silently answered.
    if (!PURGEABLE.includes(table)) throw new Error(`Unexpected table touched: ${table}`);
    const query = { delete: vi.fn(), lt: vi.fn() };
    query.delete.mockReturnValue(query);
    query.lt.mockResolvedValue(results[table] ?? { count: 0, error: null });
    queries[table] = query;
    return query;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { from, queries };
}

describe('WhatsApp operational retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('returns the deleted counts per table', async () => {
    setup({
      whatsapp_sessions: { count: 2, error: null },
      whatsapp_processed_messages: { count: 3, error: null },
      whatsapp_survey_responses: { count: 4, error: null },
    });
    await expect(purgeWhatsAppOperationalState({ sessionDays: 1, processedMessageDays: 2 })).resolves.toEqual({
      sessions: 2,
      processedMessages: 3,
      surveyResponses: 4,
    });
  });

  it('deletes only from the three purgeable tables, never the survey opt-outs', async () => {
    const { from } = setup();
    await purgeWhatsAppOperationalState();
    const tables = from.mock.calls.map((call) => call[0]).sort();
    expect(tables).toEqual([...PURGEABLE].sort());
    expect(tables).not.toContain('whatsapp_disclosure_logs');
    expect(tables).not.toContain('whatsapp_optins');
    expect(tables).not.toContain('whatsapp_survey_opt_outs');
  });

  it('keys each delete on expires_at with a cutoff of now minus the configured days', async () => {
    const { queries } = setup();
    await purgeWhatsAppOperationalState({ sessionDays: 3, processedMessageDays: 7 });
    expect(queries.whatsapp_sessions.lt).toHaveBeenCalledWith('expires_at', new Date(NOW.getTime() - 3 * DAY_MS).toISOString());
    expect(queries.whatsapp_processed_messages.lt).toHaveBeenCalledWith('expires_at', new Date(NOW.getTime() - 7 * DAY_MS).toISOString());
  });

  it('defaults to 1 day for sessions and 2 days for processed messages', async () => {
    const { queries } = setup();
    await purgeWhatsAppOperationalState();
    expect(queries.whatsapp_sessions.lt).toHaveBeenCalledWith('expires_at', new Date(NOW.getTime() - 1 * DAY_MS).toISOString());
    expect(queries.whatsapp_processed_messages.lt).toHaveBeenCalledWith('expires_at', new Date(NOW.getTime() - 2 * DAY_MS).toISOString());
  });

  it('deletes survey responses asked before now minus 90 days by default, keyed on asked_at', async () => {
    const { queries } = setup();
    await purgeWhatsAppOperationalState();
    expect(queries.whatsapp_survey_responses.lt).toHaveBeenCalledWith('asked_at', new Date(NOW.getTime() - 90 * DAY_MS).toISOString());
  });

  it('uses the configured survey retention days', async () => {
    const { queries } = setup();
    await purgeWhatsAppOperationalState({ surveyResponseDays: 30 });
    expect(queries.whatsapp_survey_responses.lt).toHaveBeenCalledWith('asked_at', new Date(NOW.getTime() - 30 * DAY_MS).toISOString());
  });

  it('throws when the survey delete errors', async () => {
    setup({ whatsapp_survey_responses: { count: null, error: new Error('survey failed') } });
    await expect(purgeWhatsAppOperationalState()).rejects.toThrow('survey failed');
  });

  it('throws when the session delete errors', async () => {
    setup({ whatsapp_sessions: { count: null, error: new Error('sessions failed') } });
    await expect(purgeWhatsAppOperationalState()).rejects.toThrow('sessions failed');
  });

  it('throws when the processed-message delete errors', async () => {
    setup({ whatsapp_processed_messages: { count: null, error: new Error('messages failed') } });
    await expect(purgeWhatsAppOperationalState()).rejects.toThrow('messages failed');
  });

  // Clamping lives in the caller (the cron route), not here; the purge
  // function applies whatever days it is given. See the route test.
});
