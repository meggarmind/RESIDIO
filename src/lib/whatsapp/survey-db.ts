import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { SURVEY_INTERVAL_DAYS, type SurveyReason, type SurveyScore, type SurveyTrigger } from '@/lib/whatsapp/survey';

/** The survey tables are not in the generated types until the migration is applied and `npm run db:types` re-run. */
function surveyClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/**
 * Records that the resident is being asked, and returns the row id; null when they should not be:
 * they sent STOP SURVEYS, or were asked within the last 30 days (answered or not).
 */
export async function askSurvey(input: { residentId: string; phoneNumber: string; trigger: SurveyTrigger }): Promise<string | null> {
  const client = surveyClient();

  const { data: optOut, error: optOutError } = await client
    .from('whatsapp_survey_opt_outs')
    .select('resident_id')
    .eq('resident_id', input.residentId)
    .maybeSingle();
  if (optOutError) throw optOutError;
  if (optOut) return null;

  const since = new Date(Date.now() - SURVEY_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await client
    .from('whatsapp_survey_responses')
    .select('id')
    .eq('resident_id', input.residentId)
    .gte('asked_at', since)
    .limit(1);
  if (recentError) throw recentError;
  if (recent && recent.length > 0) return null;

  const { data, error } = await client
    .from('whatsapp_survey_responses')
    .insert({ resident_id: input.residentId, phone_number: input.phoneNumber, trigger: input.trigger })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Stores an answer on a row this resident was asked; the resident id keeps one resident from writing another's row. */
export async function answerSurvey(
  residentId: string,
  surveyId: string,
  answer: { score?: SurveyScore; reason?: SurveyReason; comment?: string }
): Promise<void> {
  const { error } = await surveyClient()
    .from('whatsapp_survey_responses')
    .update({ ...answer, answered_at: new Date().toISOString() })
    .eq('id', surveyId)
    .eq('resident_id', residentId);
  if (error) throw error;
}

export async function optOutOfSurveys(residentId: string): Promise<void> {
  const { error } = await surveyClient()
    .from('whatsapp_survey_opt_outs')
    .upsert({ resident_id: residentId, opted_out_at: new Date().toISOString() }, { onConflict: 'resident_id' });
  if (error) throw error;
}
