import { NextResponse } from 'next/server';
import { getTwoFactorSessionContext, issueTwoFactorMarkerCookie } from '@/lib/auth/two-factor-session';
import { checkTrustedDevice } from '@/lib/auth/two-factor-trusted-device';
import { createTrustedDeviceRepository } from '@/lib/auth/two-factor-trusted-device-store';
import { clearTrustedDeviceCookie, readTrustedDeviceCookie } from '@/lib/auth/two-factor-trusted-device-cookie';

/**
 * Called first by the verify page (#1390). If this browser's remembered-computer cookie matches a
 * live row of the signed-in user, sets the normal residio_2fa marker for this session and the page
 * enters the app without asking for a second factor. The user comes from the session cookie only.
 */
export async function POST() {
  try {
    const session = await getTwoFactorSessionContext();
    if (!session) {
      return NextResponse.json({ trusted: false, message: 'Not authenticated' }, { status: 401 });
    }

    const check = await checkTrustedDevice(
      { userId: session.userId, token: await readTrustedDeviceCookie() },
      createTrustedDeviceRepository()
    );
    if (!check.trusted) {
      if (check.clearCookie) await clearTrustedDeviceCookie();
      return NextResponse.json({ trusted: false });
    }

    // The marker binds to this request's own session id, as after a code.
    if (!(await issueTwoFactorMarkerCookie())) {
      return NextResponse.json({ trusted: false }, { status: 500 });
    }
    return NextResponse.json({ trusted: true });
  } catch (error) {
    console.error('[2FA Trusted Device Use API] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ trusted: false }, { status: 500 });
  }
}
