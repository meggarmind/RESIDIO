import { cookies } from 'next/headers';
import { TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_TTL_SECONDS } from '@/lib/auth/two-factor-trusted-device';

/** The "remembered computer" cookie (#1390): HttpOnly, Secure in production, SameSite=Lax, 30 days. */

export async function readTrustedDeviceCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
}

export async function setTrustedDeviceCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TRUSTED_DEVICE_TTL_SECONDS,
    path: '/',
  });
}

export async function clearTrustedDeviceCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: TRUSTED_DEVICE_COOKIE, path: '/' });
}
