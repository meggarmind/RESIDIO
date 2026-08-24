import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { promoteWhatsAppPilotToEstate } from '../pilot';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage' } }));

const authorized = { authorized: true, userId: 'admin-1', error: null };

function query(result: { data?: unknown; error?: unknown }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'update']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

describe('WhatsApp pilot promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
  });

  it('requires authorization before creating a database client', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: false, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('promotes only an active pilot and records the estate-wide transition', async () => {
    const current = query({ data: { value: 'pilot' }, error: null });
    const update = query({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValueOnce(current).mockReturnValueOnce(update) } as never);

    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: true, error: null });
    expect(update.update).toHaveBeenCalledWith({ value: 'estate' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', oldValues: { whatsapp_rollout_mode: 'pilot' } }));
  });

  it('refuses an estate-wide promotion when no pilot is active', async () => {
    const current = query({ data: { value: 'disabled' }, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(current) } as never);
    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: false, error: 'Only an active pilot can be promoted estate-wide' });
    expect(logAudit).not.toHaveBeenCalled();
  });
});
