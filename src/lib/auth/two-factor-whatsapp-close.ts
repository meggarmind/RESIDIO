import { getTwoFactorSessionContext } from '@/lib/auth/two-factor-session';
import { closeWhatsAppApproval } from '@/lib/auth/two-factor-whatsapp';
import { createTwoFactorWhatsAppDeps } from '@/lib/auth/two-factor-whatsapp-store';

/**
 * Closes the current login session's open WhatsApp sign-in approval (#1389), for the session in the
 * cookie. Called after an authenticator or backup code completes the second factor, and on cancel.
 * Never throws: a failure here must not undo a sign-in that already succeeded.
 */
export async function closeCurrentWhatsAppApproval(): Promise<void> {
  try {
    const session = await getTwoFactorSessionContext();
    if (!session) return;
    await closeWhatsAppApproval(session, createTwoFactorWhatsAppDeps());
  } catch (error) {
    console.error('[2FA WhatsApp] Could not close the open approval request:', error instanceof Error ? error.message : error);
  }
}
