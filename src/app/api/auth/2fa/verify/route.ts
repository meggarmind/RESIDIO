import { NextRequest, NextResponse } from 'next/server';
import { verifyTwoFactorCode } from '@/actions/two-factor/verify';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code } = body as { userId: string; code: string };

    if (!userId || !code) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await verifyTwoFactorCode(userId, { code });

    if (result.success && result.verified) {
      // Set a cookie to indicate 2FA has been verified for this session
      const cookieStore = await cookies();
      cookieStore.set('2fa_verified', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[2FA Verify API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
