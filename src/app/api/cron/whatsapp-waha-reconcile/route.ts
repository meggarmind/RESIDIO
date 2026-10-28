import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { reconcileWahaInbound } from '@/lib/whatsapp/providers/waha-reconcile';

export const runtime = 'nodejs';

/**
 * Replays inbound WAHA messages the webhook missed (#1262). Recommended
 * schedule: every 15 minutes.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:whatsapp-waha-reconcile', 'reconcile', runReconcile);
}

async function runReconcile(run: SystemLogRun) {
  try {
    const resolved = await resolveWhatsAppConfig();

    if (resolved.status === 'unusable') {
      run.outcome = 'failure';
      run.error = `WAHA credentials are unusable: ${resolved.reason}`;
      return NextResponse.json({ error: 'WAHA credentials are unusable' }, { status: 503 });
    }

    // Not an error: an estate on another provider, or none yet, has nothing to reconcile.
    if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
      run.summary = { skipped: 'waha_not_configured' };
      return NextResponse.json({ success: true, skipped: 'waha_not_configured' });
    }

    const result = await reconcileWahaInbound(resolved.config);
    run.summary = { ...result.summary };
    if (!result.ok) {
      run.error = result.error;
      return NextResponse.json({ error: result.error, ...result.summary }, { status: 500 });
    }
    return NextResponse.json({ success: true, ...result.summary });
  } catch (error) {
    // The message names an HTTP status or a database error, never the API key.
    run.error = error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'WAHA reconciliation failed' },
      { status: 500 }
    );
  }
}
