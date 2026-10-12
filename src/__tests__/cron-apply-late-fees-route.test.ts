import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/apply-late-fees/route';

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  runLateFeeApplication: vi.fn(),
  getLateFeeSettings: vi.fn(),
}));

vi.mock('@/lib/auth/cron-auth', () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock('@/lib/billing/apply-late-fees', () => ({ runLateFeeApplication: mocks.runLateFeeApplication }));
vi.mock('@/actions/billing/apply-late-fees', () => ({ getLateFeeSettings: mocks.getLateFeeSettings }));

const request = {} as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cron apply-late-fees route (#470)', () => {
  it('rejects an unauthenticated request without reading settings or running the service-role job', async () => {
    mocks.verifyCronAuth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await GET(request);

    expect(res.status).toBe(401);
    expect(mocks.getLateFeeSettings).not.toHaveBeenCalled();
    expect(mocks.runLateFeeApplication).not.toHaveBeenCalled();
  });

  it('runs the cron-trigger job only after verifyCronAuth passes', async () => {
    mocks.verifyCronAuth.mockReturnValue(null);
    mocks.getLateFeeSettings.mockResolvedValue({
      enabled: true,
      autoApply: true,
      applicationDay: new Date().getDate(),
    });
    mocks.runLateFeeApplication.mockResolvedValue({
      success: true, processed: 0, applied: 0, totalLateFees: 0,
      skippedWaiver: 0, skippedAlreadyApplied: 0, errors: [],
    });

    const res = await GET(request);

    expect(res.status).toBe(200);
    expect(mocks.runLateFeeApplication).toHaveBeenCalledWith('cron');
    expect(mocks.verifyCronAuth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runLateFeeApplication.mock.invocationCallOrder[0],
    );
  });
});
