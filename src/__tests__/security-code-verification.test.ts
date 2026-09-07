import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAccessCode } from '@/actions/security/codes';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { AccessCode } from '@/types/database';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: mocks.authorizePermission,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const unusedCode: AccessCode = {
  id: 'access-code-1',
  code: 'ABC123',
  code_type: 'one_time',
  contact_id: 'contact-1',
  created_at: '2026-09-01T00:00:00.000Z',
  current_uses: 0,
  is_active: true,
  max_uses: 1,
  revoked_at: null,
  revoked_by: null,
  valid_from: '2026-09-01T00:00:00.000Z',
  valid_until: '2026-10-01T00:00:00.000Z',
};

function mockCode(overrides: Partial<AccessCode> = {}) {
  const code = {
    ...unusedCode,
    ...overrides,
    contact: { id: 'contact-1', full_name: 'Test Visitor', status: 'active' },
  };
  mocks.single.mockResolvedValue({ data: code, error: null });
  return code;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T12:00:00.000Z'));
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ single: mocks.single });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verifyAccessCode', () => {
  it('denies an automatically deactivated one-time code as already used', async () => {
    const code = mockCode({ is_active: false, current_uses: 1 });

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: code,
      valid: false,
      error: null,
      reason: 'Access code has already been used',
    });
  });

  it.each([
    { current_uses: 0, revoked_at: '2026-09-07T12:00:00.000Z', revoked_by: 'officer-1' },
    { current_uses: 1, revoked_at: '2026-09-07T12:00:00.000Z', revoked_by: 'officer-1' },
    { current_uses: 1, revoked_at: '2026-09-07T12:00:00.000Z', revoked_by: null },
    { current_uses: 1, revoked_at: null, revoked_by: 'officer-1' },
  ])('preserves explicit revocation over usage: %j', async (revocation) => {
    const code = mockCode({ is_active: false, ...revocation });

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: code,
      valid: false,
      error: null,
      reason: 'Access code has been revoked',
    });
  });

  it.each<Partial<AccessCode>>([
    { current_uses: 0 },
    { current_uses: 1, max_uses: null },
    { current_uses: 1, code_type: 'permanent' },
  ])('preserves generic inactive denial: %j', async (overrides) => {
    const code = mockCode({ is_active: false, ...overrides });

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: code,
      valid: false,
      error: null,
      reason: 'Access code has been revoked',
    });
  });

  it('returns no contact or code details for an unknown code', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });

    expect(await verifyAccessCode({ code: 'UNKNOWN' })).toEqual({
      data: null,
      valid: false,
      error: null,
      reason: 'Access code not found',
    });
  });

  it('denies permission before querying or exposing a known code', async () => {
    mockCode();
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Permission denied' });

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: null,
      valid: false,
      error: 'Permission denied',
    });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SECURITY_VERIFY_CODES);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps an unused code valid with the same contact details', async () => {
    const code = mockCode();

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: code,
      valid: true,
      error: null,
    });
  });

  it('preserves the existing maximum-use denial for an active exhausted code', async () => {
    const code = mockCode({ current_uses: 1 });

    expect(await verifyAccessCode({ code: 'ABC123' })).toEqual({
      data: code,
      valid: false,
      error: null,
      reason: 'Maximum uses exceeded',
    });
  });
});
