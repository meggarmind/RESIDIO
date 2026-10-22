import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';

const RETENTION_DAYS = 30;

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:purge-performance-events', 'purge', runPurge);
}

async function runPurge(run: SystemLogRun) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // The generated types do not know this table yet; same cast as the system-log recorder.
  const client = createAdminClient() as unknown as {
    from(table: string): {
      delete(options: { count: 'exact' }): { lt(column: string, value: string): PromiseLike<{ count: number | null; error: { message: string } | null }> };
    };
  };
  const { count, error } = await client.from('performance_events').delete({ count: 'exact' }).lt('occurred_at', cutoff);
  if (error) {
    run.error = error.message;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  run.summary = { deleted: count ?? 0, retentionDays: RETENTION_DAYS };
  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
