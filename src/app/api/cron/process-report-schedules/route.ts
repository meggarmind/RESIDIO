import { NextRequest, NextResponse } from 'next/server';
import { processDueSchedules } from '@/lib/reports/process-schedules';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const dynamic = 'force-dynamic';

/**
 * Authentication: Bearer token matching CRON_SECRET, as every other cron
 * route in this directory does. This one was the only ungated route in
 * `src/app/api/cron/` -- a public GET that generates reports and emails them
 * to their subscribers, so anyone who knew the URL could trigger repeated
 * report runs and mail them out.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:process-report-schedules', 'process', runReportSchedules);
}

async function runReportSchedules(run: SystemLogRun) {

  try {
    const result = await processDueSchedules();
    run.summary = { processed: result.processed, failed: result.failed, errorCount: result.errors.length };
    if (result.failed > 0) {
      // `processed` counts successes only, so any success alongside a failure is partial.
      run.outcome = result.processed > 0 ? 'partial' : 'failure';
    } else if (result.processed === 0 && result.errors.length > 0) {
      // processDueSchedules reports a failed schedule query this way (nothing ran, one error).
      run.outcome = 'failure';
      run.error = result.errors[0];
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    run.error = e;
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, { status: 500 });
  }
}
