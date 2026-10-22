import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleResidentMessage = vi.fn().mockResolvedValue({});
const getPausedUntil = vi.fn();

vi.mock('@/lib/whatsapp', () => ({
  canPerformWhatsAppFinancialLookup: vi.fn(),
  createSupabaseProcessedMessageStore: vi.fn(() => ({})),
  createSupabaseWhatsAppFinancialRepository: vi.fn(),
  createSupabaseWhatsAppIdentityRepository: vi.fn(() => ({ repo: true })),
  handleFinancialMessage: vi.fn(),
  handleResidentMessage: (...args: unknown[]) => handleResidentMessage(...args),
  // Run the handler on every message, as the real claim/release store would.
  processInboundMessages: async (
    messages: unknown[],
    deps: { onMessage: (m: unknown) => Promise<void> }
  ) => {
    for (const m of messages) await deps.onMessage(m);
    return {};
  },
}));
vi.mock('@/lib/whatsapp/providers/chatmaid-inbound', () => ({
  createSupabaseChatmaidSessionPauseStore: () => ({ getPausedUntil }),
}));

import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';

const msg = (text: string) => ({ id: 'm1', from: '2348000000000', timestamp: '1', type: 'text' as const, text });

describe('processChatmaidMessages human takeover', () => {
  beforeEach(() => {
    handleResidentMessage.mockClear();
    getPausedUntil.mockResolvedValue(new Date(Date.now() + 60_000));
  });

  it('still records STOP during a takeover, without replying', async () => {
    const { pausedCount } = await processChatmaidMessages([msg('STOP')]);

    expect(pausedCount).toBe(1);
    expect(handleResidentMessage).toHaveBeenCalledTimes(1);
    const options = handleResidentMessage.mock.calls[0][1];
    expect(await options.send({ to: 'x', body: 'y' })).toEqual({ success: true });
  });

  it('drops other messages during a takeover', async () => {
    await processChatmaidMessages([msg('balance')]);
    expect(handleResidentMessage).not.toHaveBeenCalled();
  });
});
