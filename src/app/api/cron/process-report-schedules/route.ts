import { NextRequest, NextResponse } from 'next/server';
import { processDueSchedules } from '@/actions/reports/process-schedules';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

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

  try {
    const result = await processDueSchedules();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    }, { status: 500 });
  }
}
