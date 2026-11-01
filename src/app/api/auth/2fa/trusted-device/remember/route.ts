import { NextRequest, NextResponse } from 'next/server';
import { getTwoFactorSessionContext, hasVerifiedTwoFactorSession } from '@/lib/auth/two-factor-session';
import { rememberTrustedDevice } from '@/lib/auth/two-factor-trusted-device';
import { createTrustedDeviceRepository } from '@/lib/auth/two-factor-trusted-device-store';
import { setTrustedDeviceCookie } from '@/lib/auth/two-factor-trusted-device-cookie';
import { summarizeUserAgent } from '@/lib/auth/two-factor-whatsapp';

/**
 * "Yes, remember it" on the verify page (#1390). Remembers this computer for 30 days for the
 * signed-in user. The user comes from the session cookie only (#455), and the session must already
 * hold a valid residio_2fa marker from a real second factor: a session that entered through a
 * remembered computer cannot remember it again, so 30 days stays 30 days.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getTwoFactorSessionContext();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const secondFactorDone = await hasVerifiedTwoFactorSession(session.userId, { requireRealFactor: true });
    const result = await rememberTrustedDevice(
      { userId: session.userId, secondFactorDone, userAgentSummary: summarizeUserAgent(request.headers.get('user-agent')) },
      createTrustedDeviceRepository()
    );
    if (!result) {
      return NextResponse.json({ success: false, message: 'Finish signing in first.' }, { status: 403 });
    }

    await setTrustedDeviceCookie(result.token);
    return NextResponse.json({ success: true, expiresAt: result.expiresAt.toISOString() });
  } catch (error) {
    console.error('[2FA Trusted Device Remember API] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, message: 'Could not remember this computer.' }, { status: 500 });
  }
}
