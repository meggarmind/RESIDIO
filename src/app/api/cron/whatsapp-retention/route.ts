import { NextRequest, NextResponse } from 'next/server';
import { getSettingValue } from '@/actions/settings/get-settings';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { purgeWhatsAppOperationalState } from '@/lib/whatsapp/retention';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const [sessionDays, processedMessageDays] = await Promise.all([
      getSettingValue('whatsapp_session_retention_days'),
      getSettingValue('whatsapp_processed_message_retention_days'),
    ]);
    const result = await purgeWhatsAppOperationalState({
      sessionDays: typeof sessionDays === 'number' ? Math.min(Math.max(sessionDays, 1), 30) : 1,
      processedMessageDays: typeof processedMessageDays === 'number' ? Math.min(Math.max(processedMessageDays, 1), 30) : 2,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp retention failed' }, { status: 500 });
  }
}
