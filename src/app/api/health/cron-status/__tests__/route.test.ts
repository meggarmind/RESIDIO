import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Guard test for GET /api/health/cron-status.
 *
 * This route uses `computeCronStatus()`, which queries via the service-role
 * admin client (bypasses RLS) and returns full cron job status, including
 * Gmail connection state, to whoever calls it. Before #174 the route had no
 * authorization check at all, so it was reachable by any anonymous caller.
 *
 * `computeCronStatus` is mocked out entirely: this test's job is to prove
 * the route refuses an unauthorized caller with a JSON error response
 * BEFORE it ever touches the data layer, not to exercise the status
 * computation itself.
 */

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  computeCronStatus: vi.fn(),
  verifyCronAuth: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/system/cron-status', () => ({ computeCronStatus: mocks.computeCronStatus }));
vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: mocks.verifyCronAuth }));

import { NextResponse } from 'next/server';

import { GET } from '../route';

/** A stand-in request; the route only forwards it to verifyCronAuth. */
const req = () => ({ headers: new Headers() }) as never;

describe('GET /api/health/cron-status', () => {
  beforeEach(() => {
    mocks.authorizePermission.mockReset();
    mocks.computeCronStatus.mockReset();
    mocks.verifyCronAuth.mockReset();
    // Default: not a valid cron caller, so tests exercise the session path
    // unless they say otherwise.
    mocks.verifyCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    process.env.CRON_SECRET = 'test-secret';
    // Default so a broken guard falls through to a real (if fake) 200,
    // producing a clean status-code assertion failure below rather than a
    // JSON-serialization crash on an unconfigured mock's `undefined`.
    mocks.computeCronStatus.mockResolvedValue({
      overall: 'healthy',
      status: 'healthy',
      timestamp: '2026-09-03T00:00:00.000Z',
      lastChecked: '2026-09-03T00:00:00.000Z',
      jobs: [],
    });
  });

  it('refuses an unauthorized caller with a JSON 403 and never touches the data layer', async () => {
    mocks.authorizePermission.mockResolvedValue({
      authorized: false,
      error: 'Unauthorized: Not authenticated',
    });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Unauthorized: Not authenticated' });
    expect(mocks.computeCronStatus).not.toHaveBeenCalled();
  });

  it('serves cron status to a machine holding the CRON_SECRET, with no session', async () => {
    // The daily backup workflow has no session at all. Before this path
    // existed, closing the hole made that safety net return 403 and go
    // silently inert -- it treats any non-200 as "unknown" and exits 0.
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.authorizePermission.mockResolvedValue({
      authorized: false,
      error: 'Unauthorized: Not authenticated',
    });

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
    expect(mocks.computeCronStatus).toHaveBeenCalledTimes(1);
  });

  it('does not fall open when CRON_SECRET is unset, even though verifyCronAuth allows it', async () => {
    // verifyCronAuth returns null (allow) when no secret is configured and
    // NODE_ENV is not production. Consulting it unguarded would leave this
    // route open on every developer machine, so the route requires the secret
    // to exist before it will trust that answer.
    delete process.env.CRON_SECRET;
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.authorizePermission.mockResolvedValue({
      authorized: false,
      error: 'Unauthorized: Not authenticated',
    });

    const response = await GET(req());

    expect(response.status).toBe(403);
    expect(mocks.computeCronStatus).not.toHaveBeenCalled();
  });

  it('serves cron status to an authorized caller', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true, error: null });
    mocks.computeCronStatus.mockResolvedValue({
      overall: 'healthy',
      status: 'healthy',
      timestamp: '2026-09-03T00:00:00.000Z',
      lastChecked: '2026-09-03T00:00:00.000Z',
      jobs: [],
    });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.overall).toBe('healthy');
    expect(mocks.computeCronStatus).toHaveBeenCalledTimes(1);
  });
});
