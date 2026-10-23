import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { HOLDING_REPLY, isSecretShaped, type WhatsAppHeldMessageStore } from '@/lib/whatsapp/held-messages';
import { replayHeldWhatsAppMessages } from '@/lib/whatsapp/held-replay';
import { handleResidentMessage, type WhatsAppIdentityHandlerOptions, type WhatsAppIdentityRepository } from '@/lib/whatsapp/identity';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

vi.mock('@/lib/whatsapp/master-switch', () => ({
  isWhatsAppMasterSwitchOn: vi.fn(),
}));

function memoryStore(clock: { now: Date }) {
  const saved: { message: WhatsAppInboundMessage; receivedAt: Date }[] = [];
  const replied = new Set<string>();
  const store: WhatsAppHeldMessageStore = {
    async save(message) {
      if (!saved.some((row) => row.message.id === message.id)) saved.push({ message, receivedAt: clock.now });
    },
    async claimHoldingReply(phoneNumber) {
      if (replied.has(phoneNumber)) return false;
      replied.add(phoneNumber);
      return true;
    },
    async clearHoldingReplies() {
      replied.clear();
    },
    async dropOlderThan(cutoff) {
      for (let i = saved.length - 1; i >= 0; i -= 1) if (saved[i].receivedAt < cutoff) saved.splice(i, 1);
    },
    async takeOldest() {
      return saved.shift()?.message ?? null;
    },
  };
  return { store, saved };
}

function message(id: string, text: string | null, from = '2348000000000'): WhatsAppInboundMessage {
  return { id, from, timestamp: '1760000000', type: 'text', text };
}

// Any resident-record read while the switch is off fails the test.
const repository = new Proxy({} as WhatsAppIdentityRepository, {
  get: (_, name) => () => Promise.reject(new Error(`repository.${String(name)} read while the switch is off`)),
});

describe('WhatsApp Assistant while the master switch is off (#1075)', () => {
  let clock: { now: Date };
  let held: ReturnType<typeof memoryStore>;
  let send: Mock<NonNullable<WhatsAppIdentityHandlerOptions['send']>>;

  async function inbound(msg: WhatsAppInboundMessage, extra: { holdWhenOff?: boolean } = {}) {
    return handleResidentMessage(msg, {
      repository,
      send,
      heldMessages: held.store,
      estateContactLine: async () => 'Estate office: 0800 000 0000',
      ...extra,
    });
  }

  beforeEach(() => {
    clock = { now: new Date('2026-10-22T10:00:00Z') };
    held = memoryStore(clock);
    send = vi.fn<NonNullable<WhatsAppIdentityHandlerOptions['send']>>().mockResolvedValue({ success: true });
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: false, reason: 'disabled' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('sends the holding reply once per number and saves every message', async () => {
    await inbound(message('m1', 'What I owe'));
    await inbound(message('m2', 'hello'));
    await inbound(message('m3', 'hi', '2348111111111'));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: '2348000000000',
      body: `${HOLDING_REPLY}\nEstate office: 0800 000 0000`,
    }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: '2348111111111' }));
    expect(held.saved.map((row) => row.message.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('never saves a PIN-shaped message, but still sends the holding reply', async () => {
    await inbound(message('m1', '1234'));
    await inbound(message('m2', 'PIN 1234', '2348111111111'));

    expect(held.saved).toEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drops a message during a human takeover, with no holding reply', async () => {
    await inbound(message('m1', 'STOP'), { holdWhenOff: false });

    expect(held.saved).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not replay while the switch is still off', async () => {
    await inbound(message('m1', 'What I owe'));
    const handle = vi.fn();

    await expect(replayHeldWhatsAppMessages({ store: held.store, handle })).resolves.toEqual({ replayed: 0 });
    expect(handle).not.toHaveBeenCalled();
    expect(held.saved).toHaveLength(1);
  });

  it('answers each saved message once, oldest first, after the switch is turned on', async () => {
    await inbound(message('m1', 'What I owe'));
    await inbound(message('m2', 'hello', '2348111111111'));
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
    const handle = vi.fn().mockResolvedValue(undefined);

    const [first, second] = await Promise.all([
      replayHeldWhatsAppMessages({ store: held.store, handle, now: () => clock.now }),
      replayHeldWhatsAppMessages({ store: held.store, handle, now: () => clock.now }),
    ]);
    await replayHeldWhatsAppMessages({ store: held.store, handle, now: () => clock.now });

    expect(first.replayed + second.replayed).toBe(2);
    expect(handle.mock.calls.map(([msg]) => msg.id)).toEqual(['m1', 'm2']);
  });

  it('drops a saved message older than 24 hours instead of answering it', async () => {
    await inbound(message('old', 'What I owe'));
    clock.now = new Date('2026-10-23T09:00:00Z');
    await inbound(message('new', 'hello', '2348111111111'));
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
    const handle = vi.fn().mockResolvedValue(undefined);

    await replayHeldWhatsAppMessages({ store: held.store, handle, now: () => new Date('2026-10-23T11:00:00Z') });

    expect(handle.mock.calls.map(([msg]) => msg.id)).toEqual(['new']);
  });

  it('sends the holding reply again in the next switch-off period', async () => {
    await inbound(message('m1', 'hello'));
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
    await replayHeldWhatsAppMessages({ store: held.store, handle: vi.fn().mockResolvedValue(undefined), now: () => clock.now });
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: false, reason: 'disabled' });
    await inbound(message('m2', 'hello again'));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('reads PIN-shaped text', () => {
    for (const text of ['1234', ' 12 34 ', 'PIN', 'pin 1234', 'PIN1234']) expect(isSecretShaped(text)).toBe(true);
    for (const text of ['What I owe', 'LINK 123456', 'Flat 12', null]) expect(isSecretShaped(text)).toBe(false);
  });
});
