import { describe, expect, it, vi } from 'vitest';
import { handleFinancialMessage } from '@/lib/whatsapp/financial';
import type {
  FinancialAnswer,
  FinancialHouse,
  WhatsAppFinancialRepository,
} from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';

const identity: WhatsAppResidentIdentity = {
  id: 'resident-1',
  firstName: 'Ada',
  lastName: 'Example',
  residentCode: 'RES001',
  phonePrimary: '+2348000000000',
  phoneSecondary: null,
  financialEligible: true,
};

const answer: FinancialAnswer = { body: 'Outstanding balance: ₦10,000.00.' };

function message(text: string): WhatsAppInboundMessage {
  return { id: `wamid-${text}`, from: '2348000000000', timestamp: '1760000000', type: 'text', text };
}

function repository(houses: FinancialHouse[] = [{ id: 'house-1', label: 'OAK-1' }]): WhatsAppFinancialRepository {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
    getForcePin: vi.fn().mockResolvedValue(false),
    getPinHash: vi.fn().mockResolvedValue(null),
    setPinHash: vi.fn().mockResolvedValue(undefined),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getBalance: vi.fn().mockResolvedValue(answer),
    getLastPayment: vi.fn().mockResolvedValue({ body: 'Last payment: ₦5,000.00.' }),
    getNextDue: vi.fn().mockResolvedValue({ body: 'Next due: ₦5,000.00.' }),
    getWallet: vi.fn().mockResolvedValue({ body: 'Wallet balance: ₦0.00.' }),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WhatsApp financial menu', () => {
  it('answers balance for a single-property resident and logs disclosure', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, send });

    expect(repo.getBalance).toHaveBeenCalledWith('resident-1', 'house-1');
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({
      residentId: 'resident-1',
      houseId: 'house-1',
      menuItem: 'balance',
      pinAuthenticated: false,
    }));
    expect(send.mock.calls[0]?.[0].body).toContain('Outstanding balance');
  });

  it('asks multi-property residents to choose a property before answering', async () => {
    const repo = repository([
      { id: 'house-1', label: 'OAK-1' },
      { id: 'house-2', label: 'OAK-2' },
    ]);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('1. OAK-1');
    expect(send.mock.calls[0]?.[0].body).toContain('2. OAK-2');
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'property_selection:balance' }));
  });

  it('requires a configured PIN and accepts it before answering', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValueOnce('03ac674216f3e15c761ee1a5e255f067953623c8c0a0b7e6f3b1c5f5f6e6f6f7');
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('PIN');
  });

  it('enforces the estate-wide PIN setting for residents without a personal PIN', async () => {
    const repo = repository();
    vi.mocked(repo.getForcePin).mockResolvedValue(true);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('4–6 digit PIN');
  });

  it('sets an optional PIN and marks the session authenticated', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 1234'), identity, { repository: repo, send });

    expect(repo.setPinHash).toHaveBeenCalledWith('resident-1', expect.any(String));
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(send.mock.calls[0]?.[0].body).toContain('PIN set');
  });
});
