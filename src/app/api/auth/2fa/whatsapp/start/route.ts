import { NextRequest, NextResponse } from 'next/server';
import { getTwoFactorSessionContext } from '@/lib/auth/two-factor-session';
import { startWhatsAppApproval } from '@/lib/auth/two-factor-whatsapp';
import { createTwoFactorWhatsAppDeps } from '@/lib/auth/two-factor-whatsapp-store';

/**
 * Starts a WhatsApp sign-in approval (#1389) for the signed-in user's login session. The user is
 * taken from the session cookie; the request body is not read (#455).
 * `available: false` means the account does not use WhatsApp approval: the page shows the code entry.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getTwoFactorSessionContext();
    if (!session) {
      return NextResponse.json({ available: false, success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const result = await startWhatsAppApproval(
      { userId: session.userId, sessionId: session.sessionId, userAgent: request.headers.get('user-agent') },
      createTwoFactorWhatsAppDeps()
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('[2FA WhatsApp Start API] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { available: true, success: false, message: 'Could not start WhatsApp approval. Use your authenticator code.' },
      { status: 500 }
    );
  }
}
