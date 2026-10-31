import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { syncEstateGroupMembers } from '@/lib/whatsapp/group-sync';
import { handleGroupMembersLeft } from '@/lib/whatsapp/group-leave';

export const runtime = 'nodejs';

/**
 * Makes the estate WhatsApp group's member list equal to WAHA's (#1325).
 * Recommended schedule: nightly.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:whatsapp-waha-group-sync', 'sync', runSync);
}

async function runSync(run: SystemLogRun) {
  try {
    const resolved = await resolveWhatsAppConfig();

    if (resolved.status === 'unusable') {
      run.outcome = 'failure';
      run.error = `WAHA credentials are unusable: ${resolved.reason}`;
      return NextResponse.json({ error: 'WAHA credentials are unusable' }, { status: 503 });
    }

    // Not an error: an estate on another provider, or none yet, has no WAHA group.
    if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
      run.summary = { skipped: 'waha_not_configured' };
      return NextResponse.json({ success: true, skipped: 'waha_not_configured' });
    }

    const result = await syncEstateGroupMembers(resolved.config, { onLeave: handleGroupMembersLeft });
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
      { error: error instanceof Error ? error.message : 'WAHA group sync failed' },
      { status: 500 }
    );
  }
}
