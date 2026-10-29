import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { runWeeklyAdminReport } from '@/lib/whatsapp/admin-weekly-report';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:whatsapp-admin-weekly', 'email', runWeeklyReport);
}

async function runWeeklyReport(run: SystemLogRun) {
  try {
    const result = await runWeeklyAdminReport();
    run.summary = result;
    // No active Chairman with an email means nobody was told, which must not read as a success.
    if (result.recipients === 0) run.outcome = 'failure';
    return NextResponse.json({ success: result.recipients > 0, ...result }, { status: result.recipients > 0 ? 200 : 500 });
  } catch (error) {
    run.error = error;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp admin weekly email failed' }, { status: 500 });
  }
}
