import { randomInt, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import type { VerificationType } from '@/types/database';

/** Token expiry in minutes. */
export const TOKEN_EXPIRY_MINUTES = 30;

/** Rate limit: max tokens per hour per resident. */
export const MAX_TOKENS_PER_HOUR = 3;

export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Generate a uniformly random 6-digit OTP from a CSPRNG (Math.random is predictable).
 * Zero-padded: the token column accepts any 6 digits (^[0-9]{6}$).
 */
export function generateOTP(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Check rate limit for verification token generation
 */
export async function checkRateLimit(residentId: string, tokenType: VerificationType): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  waitMinutes?: number;
}> {
  const supabase = createAdminClient();

  // Count tokens created in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('verification_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('resident_id', residentId)
    .eq('token_type', tokenType)
    .gte('created_at', oneHourAgo);

  const tokensUsed = count || 0;
  const remainingAttempts = MAX_TOKENS_PER_HOUR - tokensUsed;

  if (remainingAttempts <= 0) {
    return {
      allowed: false,
      remainingAttempts: 0,
      waitMinutes: 60,
    };
  }

  return {
    allowed: true,
    remainingAttempts,
  };
}

/**
 * Invalidate any existing unused tokens for the same resident and type
 */
export async function invalidateExistingTokens(
  residentId: string,
  tokenType: VerificationType
): Promise<void> {
  const supabase = createAdminClient();

  // Mark existing unused tokens as used (effectively invalidating them)
  await supabase
    .from('verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('resident_id', residentId)
    .eq('token_type', tokenType)
    .is('used_at', null);
}

/** Constant-time comparison; a length mismatch is a plain mismatch, never a throw. */
export function codesMatch(supplied: string, stored: string): boolean {
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(String(stored ?? '').trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Minimal typed view of the admin client for the new RPC. The generated types do
 * not know record_failed_verification_attempt until the migration is applied and
 * `npm run db:types` is re-run, so the cast is confined to this one wrapper.
 * remove the cast after db:types regeneration (#556)
 */
interface FailedAttemptRpcClient {
  rpc(
    name: 'record_failed_verification_attempt',
    args: { p_resident_id: string; p_token_type: string; p_max_attempts: number }
  ): PromiseLike<{
    data: { attempts: number; invalidated: boolean }[] | null;
    error: unknown;
  }>;
}

export async function recordFailedAttemptRpc(
  client: ReturnType<typeof createAdminClient>,
  residentId: string,
  tokenType: VerificationType
) {
  return (client as unknown as FailedAttemptRpcClient).rpc('record_failed_verification_attempt', {
    p_resident_id: residentId,
    p_token_type: tokenType,
    p_max_attempts: MAX_VERIFICATION_ATTEMPTS,
  });
}
