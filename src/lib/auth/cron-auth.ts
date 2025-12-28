import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Validates CRON request authentication using timing-safe comparison.
 *
 * Security features:
 * - Timing-safe comparison prevents timing attacks
 * - Requires CRON_SECRET in production
 * - Returns standardized error responses
 *
 * @param request - The incoming NextRequest
 * @returns null if authenticated, or a NextResponse error if not
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is required
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    console.error('[Cron] CRON_SECRET not configured in production');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  // Skip auth in development if no secret is set
  if (!cronSecret && process.env.NODE_ENV !== 'production') {
    return null; // Allow through
  }

  // Validate auth header format
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[Cron] Missing or invalid authorization header');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providedToken = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Use timing-safe comparison to prevent timing attacks
  try {
    const expectedBuffer = Buffer.from(cronSecret!, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');

    // Buffers must be same length for timingSafeEqual
    // If lengths differ, create equal-length buffers to prevent length-based timing leak
    if (expectedBuffer.length !== providedBuffer.length) {
      // Create dummy buffer of same length as expected and compare (will always fail)
      const dummyBuffer = Buffer.alloc(expectedBuffer.length);
      timingSafeEqual(expectedBuffer, dummyBuffer);
      console.warn('[Cron] Unauthorized request - token length mismatch');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
      console.warn('[Cron] Unauthorized request - invalid token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    console.error('[Cron] Error during token validation');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Authentication successful
  return null;
}
