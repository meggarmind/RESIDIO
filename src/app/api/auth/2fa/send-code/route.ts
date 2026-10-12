import { NextRequest, NextResponse } from 'next/server';
import { sendTwoFactorCode } from '@/actions/two-factor/verify';
import type { TwoFactorMethod } from '@/types/database';

const METHODS: TwoFactorMethod[] = ['sms', 'authenticator', 'email'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // The user is derived from the session inside the action; any userId in the body is ignored (#455).
    const { method } = body as { method?: TwoFactorMethod };

    if (!method || !METHODS.includes(method)) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await sendTwoFactorCode(method);

    return NextResponse.json(result, { status: result.message === 'Not authenticated' ? 401 : 200 });
  } catch (error) {
    console.error('[2FA Send Code API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
