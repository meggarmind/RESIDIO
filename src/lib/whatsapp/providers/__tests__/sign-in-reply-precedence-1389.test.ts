import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryTwoFactorWhatsApp } from '@/__tests__/helpers/two-factor-whatsapp-memory';
import { startWhatsAppApproval } from '@/lib/auth/two-factor-whatsapp';

/**
 * #1389: a typed answer to a pending sign-in approval is consumed BEFORE the resident menu and admin
 * mode. On 29 Oct a bare "1" went to the open resident session and unsubscribed the owner.
 */

const handleResidentMessage = vi.fn().mockResolvedValue({});
const getPausedUntil = vi.fn();
const state = vi.hoisted(() => ({ mem: null as unknown }));

vi.mock('@/lib/whatsapp', () => ({
  canPerformWhatsAppFinancialLookup: vi.fn(),
  createSupabaseProcessedMessageStore: vi.fn(() => ({})),
  createSupabaseWhatsAppFinancialRepository: vi.fn(),
  createSupabaseWhatsAppIdentityRepository: vi.fn(() => ({ repo: true })),
  handleFinancialMessage: vi.fn(),
  handleResidentMessage: (...args: unknown[]) => handleResidentMessage(...args),
  processInboundMessages: async (messages: unknown[], deps: { onMessage: (m: unknown) => Promise<void> }) => {
    for (const m of messages) await deps.onMessage(m);
    return {};
  },
}));
vi.mock('@/lib/whatsapp/admin', () => ({ createWhatsAppAdminTools: vi.fn() }));
vi.mock('@/lib/whatsapp/providers/chatmaid-inbound', () => ({
  createSupabaseChatmaidSessionPauseStore: () => ({ getPausedUntil }),
}));
vi.mock('@/lib/auth/two-factor-whatsapp-store', () => ({
  createTwoFactorWhatsAppDeps: () => (state.mem as ReturnType<typeof createMemoryTwoFactorWhatsApp>).deps,
}));

import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';

const ADMIN = 'admin-1';
const PHONE = '+2348030000001';
const msg = (text: string, from = PHONE) => ({ id: `m-${text}`, from, timestamp: '1', type: 'text' as const, text });

let mem: ReturnType<typeof createMemoryTwoFactorWhatsApp>;

async function openRequest() {
  await startWhatsAppApproval({ userId: ADMIN, sessionId: 'session-1', userAgent: null }, mem.deps);
  return mem.requests[mem.requests.length - 1];
}

beforeEach(() => {
  mem = createMemoryTwoFactorWhatsApp();
  mem.addAccount({ profileId: ADMIN, phoneNumber: PHONE });
  state.mem = mem;
  handleResidentMessage.mockClear();
  getPausedUntil.mockResolvedValue(null);
});

describe('sign-in answers come before the resident menu (#1389)', () => {
  it('the typed number approves and never reaches the menu', async () => {
    const request = await openRequest();
    await processChatmaidMessages([msg(request.matchCode)]);
    expect(request.status).toBe('approved');
    expect(handleResidentMessage).not.toHaveBeenCalled();
  });

  it('NO denies and never reaches the menu', async () => {
    const request = await openRequest();
    await processChatmaidMessages([msg('NO')]);
    expect(request.status).toBe('denied');
    expect(handleResidentMessage).not.toHaveBeenCalled();
  });

  it('is consumed even during a human takeover pause', async () => {
    getPausedUntil.mockResolvedValue(new Date(Date.now() + 60_000));
    const request = await openRequest();
    await processChatmaidMessages([msg(request.matchCode)]);
    expect(request.status).toBe('approved');
    expect(handleResidentMessage).not.toHaveBeenCalled();
  });

  it('with no pending request, a 2-digit reply goes to the menu as before', async () => {
    await processChatmaidMessages([msg('12')]);
    expect(handleResidentMessage).toHaveBeenCalledTimes(1);
  });

  it('a single digit is not an answer and goes to the menu, leaving the request open', async () => {
    const request = await openRequest();
    await processChatmaidMessages([msg('1')]);
    expect(handleResidentMessage).toHaveBeenCalledTimes(1);
    expect(request.status).toBe('pending');
  });

  it('the same number from another phone goes to the menu and does not approve', async () => {
    const request = await openRequest();
    await processChatmaidMessages([msg(request.matchCode, '+2348099999999')]);
    expect(handleResidentMessage).toHaveBeenCalledTimes(1);
    expect(request.status).toBe('pending');
  });
});
