import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { answerSurvey, askSurvey, optOutOfSurveys } from '@/lib/whatsapp/survey-db';
import { cleanSurveyComment, isSurveyStopCommand, isThanks, parseSurveyReason, parseSurveyScore } from '@/lib/whatsapp/survey';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

const clientMock = vi.mocked(createAdminClient);

type Result = { data?: unknown; error?: unknown };

/** A chainable query whose awaited result, or .maybeSingle()/.single() result, is `result`. */
function query(result: Result) {
  const value = { data: null, error: null, ...result };
  const q = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'insert', 'update', 'upsert', 'eq', 'gte', 'limit']) q[method] = vi.fn().mockReturnValue(q);
  q.maybeSingle = vi.fn().mockResolvedValue(value);
  q.single = vi.fn().mockResolvedValue(value);
  q.then = vi.fn((resolve: (result: Result) => unknown) => Promise.resolve(resolve(value)));
  return q;
}

function tables(byTable: Record<string, ReturnType<typeof query>[]>) {
  const from = vi.fn((table: string) => {
    const next = byTable[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    return next;
  });
  clientMock.mockReturnValue({ from } as never);
  return from;
}

const INPUT = { residentId: 'resident-1', phoneNumber: '+2348000000000', trigger: 'answer' as const };

describe('survey wording and parsing (#872)', () => {
  it('reads scores and reasons by number, and rejects everything else including object keys', () => {
    expect(['1', '2', '3', 'good', 'okay', 'poor'].map(parseSurveyScore)).toEqual(['good', 'okay', 'poor', 'good', 'okay', 'poor']);
    expect(['1', '2', '3', '4'].map(parseSurveyReason)).toEqual(['too_slow', 'not_found', 'wrong_information', 'other']);
    for (const input of ['0', '4', 'banana', 'constructor', '__proto__', '']) expect(parseSurveyScore(input)).toBeNull();
    for (const input of ['0', '5', 'constructor', '']) expect(parseSurveyReason(input)).toBeNull();
  });

  it('tells STOP SURVEYS from STOP', () => {
    for (const text of ['STOP SURVEYS', 'stop surveys', ' Stop   Survey ', 'STOP SURVEYS.']) expect(isSurveyStopCommand(text)).toBe(true);
    for (const text of ['STOP', 'STOP ALL', 'stop surveys please', 'SURVEYS']) expect(isSurveyStopCommand(text)).toBe(false);
  });

  it('treats only a plain thank-you or ok as thanks', () => {
    for (const input of ['thanks', 'thank you', 'thx', 'ok', 'okay']) expect(isThanks(input)).toBe(true);
    for (const input of ['no', 'menu', 'thanks a lot', '']) expect(isThanks(input)).toBe(false);
  });

  it('keeps a comment up to 300 characters, and drops skip words and digit-only text', () => {
    expect(cleanSurveyComment('  The menu confused me ', 'the menu confused me')).toBe('The menu confused me');
    expect(cleanSurveyComment('x'.repeat(400), 'x')).toHaveLength(300);
    for (const text of ['skip', 'SKIP', 'no', '0', 'menu', '', '482915', 'PIN 482915', '1 2 3 4']) expect(cleanSurveyComment(text, text.toLowerCase())).toBeNull();
  });
});

describe('survey database access (#872)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks nobody who sent STOP SURVEYS, and records nothing', async () => {
    const optOut = query({ data: { resident_id: 'resident-1' } });
    const from = tables({ whatsapp_survey_opt_outs: [optOut], whatsapp_survey_responses: [] });

    expect(await askSurvey(INPUT)).toBeNull();
    expect(optOut.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
    expect(from).not.toHaveBeenCalledWith('whatsapp_survey_responses');
  });

  it('asks nobody who was asked in the last 30 days, answered or not', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    const recent = query({ data: [{ id: 'earlier' }] });
    tables({ whatsapp_survey_opt_outs: [query({ data: null })], whatsapp_survey_responses: [recent] });

    expect(await askSurvey(INPUT)).toBeNull();
    expect(recent.gte).toHaveBeenCalledWith('asked_at', '2026-09-20T12:00:00.000Z');
    vi.useRealTimers();
  });

  it('records the ask and returns its id when the resident is due', async () => {
    const insert = query({ data: { id: 'survey-9' } });
    tables({ whatsapp_survey_opt_outs: [query({ data: null })], whatsapp_survey_responses: [query({ data: [] }), insert] });

    expect(await askSurvey(INPUT)).toBe('survey-9');
    expect(insert.insert).toHaveBeenCalledWith({ resident_id: 'resident-1', phone_number: '+2348000000000', trigger: 'answer' });
  });

  it('throws a database error rather than asking blind', async () => {
    tables({ whatsapp_survey_opt_outs: [query({ error: new Error('boom') })], whatsapp_survey_responses: [] });
    await expect(askSurvey(INPUT)).rejects.toThrow('boom');
  });

  it("writes an answer only to the resident's own row", async () => {
    const update = query({});
    tables({ whatsapp_survey_responses: [update] });

    await answerSurvey('resident-1', 'survey-1', { score: 'poor' });

    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ score: 'poor', answered_at: expect.any(String) }));
    expect(update.eq).toHaveBeenCalledWith('id', 'survey-1');
    expect(update.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
  });

  it('stores the opt-out once per resident', async () => {
    const upsert = query({});
    tables({ whatsapp_survey_opt_outs: [upsert] });

    await optOutOfSurveys('resident-1');

    expect(upsert.upsert).toHaveBeenCalledWith(expect.objectContaining({ resident_id: 'resident-1' }), { onConflict: 'resident_id' });
  });
});
