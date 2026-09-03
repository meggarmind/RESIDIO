import { NextResponse, type NextRequest } from 'next/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { computeCronStatus } from '@/lib/system/cron-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for cron job monitoring.
 *
 * SECURITY: This uses `computeCronStatus()`, which queries via the
 * service-role admin client (bypasses RLS) and returns full cron job status
 * including Gmail connection state. It MUST stay guarded here in the route
 * handler itself, returning a JSON 403 rather than relying on
 * ROUTE_PERMISSIONS/middleware alone: middleware only reaches this route
 * because its matcher happens to exclude `api/v1` and nothing else, and even
 * when it does fire it 302-redirects to /login (an HTML page), which is not
 * a response an API caller can act on. A guard here cannot be undone by a
 * future matcher change.
 */
export async function GET(request: NextRequest) {
    // Two kinds of caller, so two ways in.
    //
    // A person reading the Cron Status page needs SYSTEM_MONITOR. A machine
    // has no session at all: `.github/workflows/backup-cron-invoices.yml` reads
    // this endpoint daily to decide whether invoice generation needs a nudge,
    // and it authenticates the way every other cron route in this repo expects
    // — a timing-safe CRON_SECRET bearer.
    //
    // The `CRON_SECRET` check is deliberate and load-bearing: `verifyCronAuth`
    // allows the request through when no secret is configured and NODE_ENV is
    // not production, so calling it unguarded would leave this route open on
    // any developer machine. Requiring the secret to exist means an absent
    // CRON_SECRET falls through to the permission check rather than past it.
    const cronAuthorized =
        Boolean(process.env.CRON_SECRET) && verifyCronAuth(request) === null;

    if (!cronAuthorized) {
        const auth = await authorizePermission(PERMISSIONS.SYSTEM_MONITOR);
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 403 });
        }
    }

    const response = await computeCronStatus();

    // Return 200 even if critical, so the UI can display the details.
    // Monitoring tools can check the JSON body for 'overall': 'critical'
    return NextResponse.json(response, { status: 200 });
}
