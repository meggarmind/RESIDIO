import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
    getSessionIdFromAccessToken,
    signTwoFactorMarker,
    TWO_FACTOR_COOKIE,
    TWO_FACTOR_MARKER_TTL_SECONDS,
    verifyTwoFactorMarker,
} from '@/lib/auth/two-factor-marker';
import { recordVerifiedSession } from '@/lib/auth/two-factor-guard';

export interface TwoFactorSessionContext {
    userId: string;
    sessionId: string | null;
}

/**
 * The caller's identity for the 2FA endpoints, taken from the Supabase session
 * cookie. Never from a request body: a client-supplied userId let anyone trigger
 * codes for, and probe the lockout of, any account (#455).
 */
export async function getTwoFactorSessionContext(): Promise<TwoFactorSessionContext | null> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: { session } } = await supabase.auth.getSession();
    return { userId: user.id, sessionId: getSessionIdFromAccessToken(session?.access_token) };
}

/**
 * Mint the signed second-factor marker cookie for the CURRENT session, and record the
 * session in the database so row-level security sees it too (#1029). Call only after a
 * code check has succeeded. Returns false (no cookie set) if there is no session id to
 * bind to, the record cannot be written, or the signing secret is unavailable: fail closed.
 */
export async function issueTwoFactorMarkerCookie(): Promise<boolean> {
    try {
        const ctx = await getTwoFactorSessionContext();
        if (!ctx?.sessionId) return false;

        const marker = await signTwoFactorMarker({ userId: ctx.userId, sessionId: ctx.sessionId });
        const expiresAt = new Date(Date.now() + TWO_FACTOR_MARKER_TTL_SECONDS * 1000);
        if (!(await recordVerifiedSession(ctx.userId, ctx.sessionId, expiresAt))) return false;
        const cookieStore = await cookies();
        cookieStore.set(TWO_FACTOR_COOKIE, marker, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: TWO_FACTOR_MARKER_TTL_SECONDS,
            path: '/',
        });
        return true;
    } catch (error) {
        console.error('[2FA] Could not issue session marker:', error instanceof Error ? error.message : error);
        return false;
    }
}

/**
 * True only when the signed-in user completed the second factor in THIS session: a valid marker
 * cookie for this user and session id. For actions that need a 2FA session on top of the
 * middleware gate (#972). Fails closed.
 */
export async function hasVerifiedTwoFactorSession(userId: string): Promise<boolean> {
    try {
        const ctx = await getTwoFactorSessionContext();
        if (!ctx || ctx.userId !== userId) return false;
        const cookieStore = await cookies();
        return await verifyTwoFactorMarker(cookieStore.get(TWO_FACTOR_COOKIE)?.value, ctx);
    } catch (error) {
        console.error('[2FA] Could not check the session marker:', error instanceof Error ? error.message : error);
        return false;
    }
}
