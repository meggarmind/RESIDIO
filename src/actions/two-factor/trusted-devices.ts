'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { hashTrustedDeviceToken, isWellFormedTrustedDeviceToken } from '@/lib/auth/two-factor-trusted-device';
import { createTrustedDeviceRepository } from '@/lib/auth/two-factor-trusted-device-store';
import { clearTrustedDeviceCookie, readTrustedDeviceCookie } from '@/lib/auth/two-factor-trusted-device-cookie';

/**
 * The signed-in admin's own remembered computers (#1390). Own rows only: the user comes from the
 * session, never from an argument. Guarded like the other two-factor self-service actions (setup,
 * backup codes, the WhatsApp approval switch), so the list shows only when Forget can be saved.
 */

export interface RememberedComputer {
  id: string;
  device: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** This browser's own cookie. */
  current: boolean;
}

type Result<T> = { data: T | null; error: string | null };

async function signedInUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The id of the row this browser's cookie points at, if it is one of the user's live rows. */
async function currentDeviceId(userId: string): Promise<string | null> {
  const token = await readTrustedDeviceCookie();
  if (!isWellFormedTrustedDeviceToken(token)) return null;
  const device = await createTrustedDeviceRepository().findByHash(hashTrustedDeviceToken(token));
  return device && device.profileId === userId ? device.id : null;
}

export async function listRememberedComputers(): Promise<Result<RememberedComputer[]>> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const userId = await signedInUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  try {
    const [devices, currentId] = await Promise.all([
      createTrustedDeviceRepository().listLive(userId, new Date()),
      currentDeviceId(userId),
    ]);
    return {
      data: devices.map((d) => ({
        id: d.id,
        device: d.userAgentSummary,
        createdAt: d.createdAt,
        lastUsedAt: d.lastUsedAt,
        expiresAt: d.expiresAt,
        current: d.id === currentId,
      })),
      error: null,
    };
  } catch (error) {
    console.error('[2FA trusted device] Could not list remembered computers:', error);
    return { data: null, error: 'Could not load your remembered computers' };
  }
}

/** Forgets one of the user's remembered computers. Forgetting this computer also clears its cookie. */
export async function forgetRememberedComputer(deviceId: string): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) return { success: false, message: auth.error || 'Unauthorized' };

  const userId = await signedInUserId();
  if (!userId) return { success: false, message: 'Not authenticated' };
  if (typeof deviceId !== 'string' || !deviceId) return { success: false, message: 'Computer not found' };

  const repo = createTrustedDeviceRepository();
  let revoked: number;
  let currentId: string | null;
  try {
    currentId = await currentDeviceId(userId);
    // Scoped to the user's own rows: another user's id revokes nothing.
    revoked = await repo.revoke(userId, 'forgotten', new Date(), deviceId);
  } catch (error) {
    console.error('[2FA trusted device] Could not forget a computer:', error);
    return { success: false, message: 'Could not forget the computer' };
  }
  if (revoked !== 1) return { success: false, message: 'Computer not found' };

  if (currentId === deviceId) await clearTrustedDeviceCookie();
  await repo.logEvent(userId, 'trusted_device_forgotten', { reason: 'forgotten', device_id: deviceId });
  await logAudit({
    action: 'DEACTIVATE',
    entityType: 'two_factor_trusted_devices',
    entityId: deviceId,
    entityDisplay: 'Remembered computer forgotten',
    newValues: { revoked_reason: 'forgotten' },
  });

  return { success: true, message: 'Computer forgotten' };
}

/** Forgets all of the user's remembered computers, and clears this browser's cookie. */
export async function forgetAllRememberedComputers(): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) return { success: false, message: auth.error || 'Unauthorized' };

  const userId = await signedInUserId();
  if (!userId) return { success: false, message: 'Not authenticated' };

  const repo = createTrustedDeviceRepository();
  let revoked: number;
  try {
    revoked = await repo.revoke(userId, 'forgotten_all', new Date());
  } catch (error) {
    console.error('[2FA trusted device] Could not forget all computers:', error);
    return { success: false, message: 'Could not forget your computers' };
  }

  await clearTrustedDeviceCookie();
  if (revoked > 0) {
    await repo.logEvent(userId, 'trusted_device_forgotten', { reason: 'forgotten_all', count: revoked });
    await logAudit({
      action: 'DEACTIVATE',
      entityType: 'two_factor_trusted_devices',
      entityId: userId,
      entityDisplay: 'All remembered computers forgotten',
      newValues: { revoked_reason: 'forgotten_all', count: revoked },
    });
  }

  return { success: true, message: 'All computers forgotten' };
}
