import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleResidentMessage } from '@/lib/whatsapp/identity';
import type { WhatsAppIdentityRepository } from '@/lib/whatsapp/identity';
import type { WhatsAppFinancialRepository } from '@/lib/whatsapp/financial';
import { handleWhatsAppAdminStep } from '@/lib/whatsapp/admin';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';

/**
 * #1291: an admin turn ends the open resident menu step, so the next bare number cannot unsubscribe.
 * Since #1292 the admin step is itself the stored node, so a reply goes to whichever step is on screen.
 */

vi.mock('@/lib/whatsapp/master-switch', () => ({ isWhatsAppMasterSwitchOn: vi.fn() }));
vi.mock('@/lib/whatsapp/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp/admin')>()),
  handleWhatsAppAdminStep: vi.fn(),
}));

const message = { id: 'wamid-1', from: '2348000000000', timestamp: '1760000000', type: 'text' as const, text: '1' };

function financialRepository() {
  const saveSession = vi.fn().mockResolvedValue(undefined);
  const getSession = vi.fn().mockResolvedValue({
    phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'alerts', selectedHouseId: null,
    pinAuthenticated: false, expiresAt: '2099-01-01T00:00:00Z',
  });
  return { saveSession, repo: { getSession, saveSession } as unknown as WhatsAppFinancialRepository };
}

function adminStepRepository() {
  const saveSession = vi.fn().mockResolvedValue(undefined);
  const getSession = vi.fn().mockResolvedValue({
    phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'admin_menu', selectedHouseId: null,
    pinAuthenticated: false, expiresAt: '2099-01-01T00:00:00Z',
  });
  return { saveSession, repo: { getSession, saveSession } as unknown as WhatsAppFinancialRepository };
}

beforeEach(() => {
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

describe('admin steps and the open resident menu step (#1291, #1292)', () => {
  it('sends a bare number to the admin step on screen, so it never reaches the alerts step', async () => {
    vi.mocked(handleWhatsAppAdminStep).mockResolvedValue(true);
    const { repo } = adminStepRepository();
    const identityRepository = { setOptIn: vi.fn(), findRosterMatches: vi.fn(), findLinkedResidents: vi.fn() };

    const result = await handleResidentMessage(message, {
      repository: identityRepository as unknown as WhatsAppIdentityRepository, adminRepository: {} as never, financialRepository: repo,
      send: vi.fn().mockResolvedValue({ success: true }),
    });

    expect(result.status).toBe('admin');
    expect(handleWhatsAppAdminStep).toHaveBeenCalledWith(message, 'admin_menu', expect.anything());
    expect(identityRepository.setOptIn).not.toHaveBeenCalled();
    expect(identityRepository.findRosterMatches).not.toHaveBeenCalled();
  });

  it('leaves a bare number on a resident step to the resident assistant', async () => {
    vi.mocked(handleWhatsAppAdminStep).mockClear();
    const { saveSession, repo } = financialRepository();
    const identityRepository = { findLinkedResidents: vi.fn().mockResolvedValue([]), findRosterMatches: vi.fn().mockResolvedValue([]), getOptIn: vi.fn().mockResolvedValue(false), rememberPendingContact: vi.fn() };

    await handleResidentMessage(message, {
      repository: identityRepository as unknown as WhatsAppIdentityRepository, adminRepository: {} as never, financialRepository: repo,
      send: vi.fn().mockResolvedValue({ success: true }),
    }).catch(() => {});

    expect(handleWhatsAppAdminStep).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });
});
