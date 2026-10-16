import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { expirePendingApprovals } from '@/lib/approvals/expire-approvals';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';

/**
 * Auto-rejects approval requests that sat pending past their 72-hour expiry and notifies each
 * requester in-app (#558). Authentication: Bearer CRON_SECRET (timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:expire-approvals', 'expire', runExpire);
}

async function runExpire(run: SystemLogRun) {
  try {
    const result = await expirePendingApprovals();
    run.summary = { ...result };
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    run.error = error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Approval expiry failed' },
      { status: 500 }
    );
  }
}
