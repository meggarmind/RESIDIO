import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getTwoFactorSessionContext, issueTwoFactorMarkerCookie } from '@/lib/auth/two-factor-session';
import { clearTwoFactorTries } from '@/lib/auth/two-factor-guard';
import { getWhatsAppApprovalStatus } from '@/lib/auth/two-factor-whatsapp';
import { createTwoFactorWhatsAppDeps } from '@/lib/auth/two-factor-whatsapp-store';

/**
 * The state of the WhatsApp sign-in approval (#1389) for the CURRENT login session only, polled by
 * the verify page every 2 seconds. On approval this call sets the residio_2fa marker for the same
 * session, once.
 */
export async function GET() {
  try {
    const session = await getTwoFactorSessionContext();
    if (!session) {
      return NextResponse.json({ status: 'none', message: 'Not authenticated' }, { status: 401 });
    }

    const deps = createTwoFactorWhatsAppDeps();
    const result = await getWhatsAppApprovalStatus(session, deps);
    if (result.status !== 'approved') {
      return NextResponse.json(result.status === 'pending' ? result : { status: result.status });
    }

    if (!result.markerAllowed) {
      // Its marker was issued already: one approval signs in once.
      return NextResponse.json({ status: 'used', message: 'This approval was already used. Sign in again.' });
    }

    // The request was found for this cookie's session id, and the marker binds to that same id.
    const issued = await issueTwoFactorMarkerCookie();
    if (!issued) {
      await deps.repository.releaseMarker(result.requestId);
      return NextResponse.json(
        { status: 'error', message: 'Could not complete verification. Please sign in again.' },
        { status: 500 }
      );
    }

    await clearTwoFactorTries(session.userId, 'login');
    await createAdminClient()
      .from('profiles')
      .update({ two_factor_last_verified_at: new Date().toISOString() })
      .eq('id', session.userId);

    return NextResponse.json({ status: 'approved' });
  } catch (error) {
    console.error('[2FA WhatsApp Status API] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ status: 'error', message: 'Could not check WhatsApp approval.' }, { status: 500 });
  }
}
