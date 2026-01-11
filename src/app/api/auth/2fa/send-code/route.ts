import { NextRequest, NextResponse } from 'next/server';
import { sendTwoFactorCode } from '@/actions/two-factor/verify';
import type { TwoFactorMethod } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, method } = body as { userId: string; method: TwoFactorMethod };

    if (!userId || !method) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await sendTwoFactorCode(userId, method);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[2FA Send Code API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
