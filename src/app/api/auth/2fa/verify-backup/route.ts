import { NextRequest, NextResponse } from 'next/server';
import { verifyBackupCode } from '@/actions/two-factor/verify';
import { issueTwoFactorMarkerCookie } from '@/lib/auth/two-factor-session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // The user is derived from the session inside the action; any userId in the body is ignored (#455).
    const { code } = body as { code?: string };

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await verifyBackupCode(code);

    if (result.success && result.verified) {
      // Signed marker bound to this user + session. Without it the middleware keeps blocking.
      const issued = await issueTwoFactorMarkerCookie();
      if (!issued) {
        return NextResponse.json(
          { success: false, message: 'Could not complete verification. Please sign in again.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[2FA Verify Backup API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
