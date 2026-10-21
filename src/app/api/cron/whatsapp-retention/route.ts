import { NextRequest, NextResponse } from 'next/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { purgeWhatsAppOperationalState, retentionDays } from '@/lib/whatsapp/retention';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:whatsapp-retention', 'purge', runPurge);
}

// The settings page stores these as JSON strings, other writers store numbers.
// Anything that is not a finite number or a non-blank numeric string falls back
// to the default, so an invalid value never widens the deletion window.

async function runPurge(run: SystemLogRun) {
  try {
    // Service-role reads (see #136) — this cron route has no authenticated
    // user, so the RLS-bound getSettingValue always returned null and the
    // configured retention windows were silently ignored in favor of the
    // hardcoded fallbacks below.
    const [sessionDays, processedMessageDays, surveyResponseDays, outboundSendDays] = await Promise.all([
      getSettingValueAsService('whatsapp_session_retention_days'),
      getSettingValueAsService('whatsapp_processed_message_retention_days'),
      getSettingValueAsService('whatsapp_survey_retention_days'),
      getSettingValueAsService('whatsapp_outbound_send_retention_days'),
    ]);
    const days = {
      sessionDays: retentionDays(sessionDays, 1, 30),
      processedMessageDays: retentionDays(processedMessageDays, 2, 30),
      surveyResponseDays: retentionDays(surveyResponseDays, 90, 365),
      outboundSendDays: retentionDays(outboundSendDays, 90, 365),
    };
    const result = await purgeWhatsAppOperationalState(days);
    run.summary = { ...result, retentionDays: days };
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    run.error = error;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp retention failed' }, { status: 500 });
  }
}
