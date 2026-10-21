import { NextRequest, NextResponse } from 'next/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:whatsapp-retention', 'purge', runPurge);
}

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
    const result = await purgeWhatsAppOperationalState({
      sessionDays: typeof sessionDays === 'number' ? Math.min(Math.max(sessionDays, 1), 30) : 1,
      processedMessageDays: typeof processedMessageDays === 'number' ? Math.min(Math.max(processedMessageDays, 1), 30) : 2,
      surveyResponseDays: typeof surveyResponseDays === 'number' ? Math.min(Math.max(surveyResponseDays, 1), 365) : 90,
      outboundSendDays: typeof outboundSendDays === 'number' ? Math.min(Math.max(outboundSendDays, 1), 365) : 90,
    });
    run.summary = { ...result };
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    run.error = error;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp retention failed' }, { status: 500 });
  }
}
