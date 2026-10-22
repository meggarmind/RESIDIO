/**
 * Database-backed two-factor guards (#1029). Node runtime only.
 *
 * - Try limit: `claimTwoFactorTry` takes one of the 5 tries per 15 minutes in one statement BEFORE
 *   the code is checked, so parallel guesses cannot exceed the limit. A correct code clears it.
 * - Single-use codes: an authenticator code is accepted only for a time step newer than the last
 *   accepted one (the #972 pattern, through the shared checker in `@/lib/auth/totp`).
 * - Verified sessions: the login token session that completed the second step, read by
 *   `public.two_factor_session_ok()` inside the admin permission helpers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { matchTotpStep } from '@/lib/auth/totp';
import { encryptTotpSecret, isPlaintextTotpSecret, otpMatches, readTotpSecret } from '@/lib/auth/two-factor-secrets';
import type { TwoFactorMethod } from '@/types/database';

export const TWO_FACTOR_MAX_TRIES = 5;
export const TWO_FACTOR_LOCK_MINUTES = 15;

/** 'login': sign-in and backup codes. 'manage': setup, new backup codes, turning two-factor off. */
export type TwoFactorTryPurpose = 'login' | 'manage';

export interface TwoFactorTry {
  allowed: boolean;
  remaining: number;
  retryAt: string | null;
}

function db(): SupabaseClient {
  // The generated types do not know the #1029 tables until that migration is applied.
  return createAdminClient() as unknown as SupabaseClient;
}

/** Claims one try. Fails closed: a database error refuses the try. */
export async function claimTwoFactorTry(profileId: string, purpose: TwoFactorTryPurpose): Promise<TwoFactorTry> {
  const { data, error } = await db().rpc('two_factor_claim_attempt', {
    p_profile_id: profileId,
    p_purpose: purpose,
    p_now: new Date().toISOString(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error('[2FA] Could not claim a code try:', error?.message ?? 'no row');
    return { allowed: false, remaining: 0, retryAt: null };
  }
  return { allowed: row.allowed === true, remaining: Number(row.remaining ?? 0), retryAt: row.retry_at ?? null };
}

/** After a correct code. */
export async function clearTwoFactorTries(profileId: string, purpose: TwoFactorTryPurpose): Promise<void> {
  const { error } = await db().from('two_factor_attempts').delete().eq('profile_id', profileId).eq('purpose', purpose);
  if (error) console.error('[2FA] Could not clear code tries:', error.message);
}

/** True while the purpose is locked. Read-only, for flows that send a code without checking one. */
export async function isTwoFactorLocked(profileId: string, purpose: TwoFactorTryPurpose): Promise<boolean> {
  const since = new Date(Date.now() - TWO_FACTOR_LOCK_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from('two_factor_attempts')
    .select('attempts')
    .eq('profile_id', profileId)
    .eq('purpose', purpose)
    .gt('window_started_at', since)
    .maybeSingle();
  if (error) {
    console.error('[2FA] Could not read the code lock:', error.message);
    return true;
  }
  return (data?.attempts ?? 0) >= TWO_FACTOR_MAX_TRIES;
}

export function tooManyTriesMessage(): string {
  return `Too many wrong codes. Please try again in ${TWO_FACTOR_LOCK_MINUTES} minutes.`;
}

/** An authenticator code, accepted at most once per account. */
export async function acceptAuthenticatorCode(profileId: string, secret: string, code: string): Promise<boolean> {
  const step = matchTotpStep(code, secret);
  if (step === null) return false;
  const { data, error } = await db().rpc('two_factor_accept_totp_step', { p_profile_id: profileId, p_step: step });
  if (error) {
    console.error('[2FA] Could not record the authenticator step:', error.message);
    return false;
  }
  return data === true;
}

/**
 * Checks a code for the account's method: an authenticator code (single use), or the newest unused
 * emailed/texted token for `tokenPurpose`, which is claimed so it works once.
 * Returns 'misconfigured' when an authenticator secret is missing or cannot be read.
 */
export async function checkAccountCode(args: {
  profileId: string;
  method: TwoFactorMethod;
  secretEncrypted: string | null;
  code: string;
  tokenPurpose: 'login' | 'setup' | 'recovery' | 'disable';
}): Promise<boolean | 'misconfigured'> {
  if (args.method === 'authenticator') {
    if (!args.secretEncrypted) return 'misconfigured';
    let secret: string;
    try {
      secret = readTotpSecret(args.secretEncrypted);
    } catch (error) {
      console.error('[2FA] Could not read TOTP secret:', error instanceof Error ? error.message : error);
      return 'misconfigured';
    }
    const accepted = await acceptAuthenticatorCode(args.profileId, secret, args.code);
    // Lazy re-encryption: a legacy plaintext secret is rewritten encrypted the first time its
    // owner proves possession of it. Best effort, never blocks the caller.
    if (accepted && isPlaintextTotpSecret(args.secretEncrypted)) {
      try {
        const admin = createAdminClient();
        await admin.from('profiles').update({ two_factor_secret_encrypted: encryptTotpSecret(secret) }).eq('id', args.profileId);
      } catch (error) {
        console.error('[2FA] Could not re-encrypt legacy TOTP secret:', error instanceof Error ? error.message : error);
      }
    }
    return accepted;
  }

  const supabase = db();
  const { data: token } = await supabase
    .from('two_factor_tokens')
    .select('id, token')
    .eq('profile_id', args.profileId)
    .eq('purpose', args.tokenPurpose)
    .eq('token_type', args.method)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!token || !otpMatches(String(token.token), args.profileId, args.code)) return false;

  // Only the request that flips used_at wins, so a concurrent replay of the same code fails.
  const { data: claimed } = await supabase
    .from('two_factor_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', token.id)
    .is('used_at', null)
    .select('id');
  return (claimed?.length ?? 0) > 0;
}

/** Records that this login token session completed the second step. */
export async function recordVerifiedSession(profileId: string, sessionId: string, expiresAt: Date): Promise<boolean> {
  const { error } = await db()
    .from('two_factor_verified_sessions')
    .upsert({ session_id: sessionId, profile_id: profileId, verified_at: new Date().toISOString(), expires_at: expiresAt.toISOString() });
  if (error) {
    console.error('[2FA] Could not record the verified session:', error.message);
    return false;
  }
  return true;
}
