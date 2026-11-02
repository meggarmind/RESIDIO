// #1390: a remembered computer is not a second factor, so linking a WhatsApp admin number needs a real one.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasVerified = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => ({ authorized: true, userId: 'user-1' })),
}));
vi.mock('@/lib/auth/two-factor-session', () => ({
  hasVerifiedTwoFactorSession: (...args: unknown[]) => hasVerified(...args),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('database must not be reached');
  }),
}));

describe('createWhatsAppAdminLinkCode (#1390)', () => {
  beforeEach(() => hasVerified.mockReset());

  it('asks for a real second factor, so a remembered-computer session is refused', async () => {
    hasVerified.mockResolvedValue(false);
    const { createWhatsAppAdminLinkCode } = await import('@/actions/whatsapp/admin-access');
    const result = await createWhatsAppAdminLinkCode();
    expect(hasVerified).toHaveBeenCalledWith('user-1', { requireRealFactor: true });
    expect(result).toMatchObject({ success: false, error: 'Sign in with your authenticator app code to link a number' });
  });
});
