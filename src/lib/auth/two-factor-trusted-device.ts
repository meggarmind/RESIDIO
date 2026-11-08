import { createHash, randomBytes } from 'node:crypto';

/**
 * "Remember this computer for 30 days" (#1390, parent #1388). Node runtime only.
 *
 * After a successful second factor, the admin can choose to remember the computer. The server then
 * sets an HttpOnly cookie with a random 32-byte token and stores only its SHA-256 hash, bound to the
 * profile, for 30 days. On a later sign-in in the same browser, a token that matches a live row of
 * the SAME user lets the server issue the normal residio_2fa marker for the new session, so the
 * verify page is skipped.
 *
 * This module holds the rules. The database is injected (`TrustedDeviceRepository`), so the rules
 * are tested without a network; the Supabase-backed implementation is in
 * `two-factor-trusted-device-store.ts`.
 */

export const TRUSTED_DEVICE_COOKIE = 'residio_2fa_device';
export const TRUSTED_DEVICE_TTL_DAYS = 30;
export const TRUSTED_DEVICE_TTL_SECONDS = TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60;

/** Why a remembered computer stopped working. Matches the CHECK list in the migration. */
export type TrustedDeviceRevokeReason =
  | 'forgotten'
  | 'forgotten_all'
  | 'password_changed'
  | 'two_factor_disabled'
  | 'backup_codes_regenerated'
  | 'role_changed';

export interface TrustedDevice {
  id: string;
  profileId: string;
  userAgentSummary: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type TrustedDeviceEvent = 'trusted_device_remembered' | 'trusted_device_used' | 'trusted_device_forgotten';

export interface TrustedDeviceRepository {
  insert(input: { profileId: string; tokenHash: string; userAgentSummary: string | null; expiresAt: Date }): Promise<TrustedDevice>;
  findByHash(tokenHash: string): Promise<TrustedDevice | null>;
  /** Sets last_used_at on a row that is still live. True only when the row was live. */
  touch(id: string, now: Date): Promise<boolean>;
  /** The profile's live rows, newest first. */
  listLive(profileId: string, now: Date): Promise<TrustedDevice[]>;
  /** Revokes the profile's live rows: one (`id`) or all. Returns how many were revoked. */
  revoke(profileId: string, reason: TrustedDeviceRevokeReason, now: Date, id?: string): Promise<number>;
  logEvent(profileId: string, event: TrustedDeviceEvent, metadata: Record<string, unknown>): Promise<void>;
}

/** 32 random bytes, base64url: 43 characters. */
export function generateTrustedDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTrustedDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A token this module could have made. Anything else is not looked up. */
export function isWellFormedTrustedDeviceToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function isTrustedDeviceLive(device: TrustedDevice, now: Date): boolean {
  return device.revokedAt === null && Date.parse(device.expiresAt) > now.getTime();
}

/**
 * Remembers this computer for the signed-in user. `secondFactorDone` must be the caller's check that
 * THIS session already holds a valid residio_2fa marker: without it the endpoint could be used to
 * skip the second factor. Returns the token to put in the cookie, or null when refused.
 */
export async function rememberTrustedDevice(
  ctx: { userId: string; secondFactorDone: boolean; userAgentSummary: string | null },
  repo: TrustedDeviceRepository,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: Date; deviceId: string } | null> {
  if (!ctx.userId || !ctx.secondFactorDone) return null;
  const token = generateTrustedDeviceToken();
  const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_TTL_SECONDS * 1000);
  const device = await repo.insert({
    profileId: ctx.userId,
    tokenHash: hashTrustedDeviceToken(token),
    userAgentSummary: ctx.userAgentSummary,
    expiresAt,
  });
  await repo.logEvent(ctx.userId, 'trusted_device_remembered', { device_id: device.id, device: ctx.userAgentSummary });
  return { token, expiresAt, deviceId: device.id };
}

export type TrustedDeviceCheck =
  | { trusted: true; deviceId: string }
  /** `clearCookie`: the token is unknown, expired or revoked, so it can never work again. */
  | { trusted: false; clearCookie: boolean };

/**
 * Checks the cookie token for the signed-in user. Trusted only for a live row of the SAME user; a
 * token of user A never helps user B. Sets last_used_at and logs the use.
 */
export async function checkTrustedDevice(
  ctx: { userId: string; token: string | null | undefined },
  repo: TrustedDeviceRepository,
  now: Date = new Date()
): Promise<TrustedDeviceCheck> {
  if (!ctx.token) return { trusted: false, clearCookie: false };
  if (!isWellFormedTrustedDeviceToken(ctx.token)) return { trusted: false, clearCookie: true };

  const device = await repo.findByHash(hashTrustedDeviceToken(ctx.token));
  if (!device) return { trusted: false, clearCookie: true };
  // Another user's computer: refuse, and leave that user's cookie alone.
  if (device.profileId !== ctx.userId) return { trusted: false, clearCookie: false };
  if (!isTrustedDeviceLive(device, now)) return { trusted: false, clearCookie: true };
  // Conditional on the row still being live, so a forget that lands in between wins.
  if (!(await repo.touch(device.id, now))) return { trusted: false, clearCookie: true };

  await repo.logEvent(ctx.userId, 'trusted_device_used', { device_id: device.id, device: device.userAgentSummary });
  return { trusted: true, deviceId: device.id };
}

/** Revokes all of a user's remembered computers, for a password change, 2FA off, new backup codes or a role change. */
export async function revokeAllTrustedDevices(
  userId: string,
  reason: TrustedDeviceRevokeReason,
  repo: TrustedDeviceRepository,
  now: Date = new Date()
): Promise<number> {
  const count = await repo.revoke(userId, reason, now);
  if (count > 0) await repo.logEvent(userId, 'trusted_device_forgotten', { reason, count });
  return count;
}
