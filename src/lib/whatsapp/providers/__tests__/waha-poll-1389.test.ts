import { describe, expect, it, vi } from 'vitest';
import { createWahaWhatsAppProvider } from '@/lib/whatsapp/providers/waha';
import { extractWahaPollVote, resolveWahaVoterPhone } from '@/lib/whatsapp/providers/waha-inbound';
import { sendWhatsAppPoll, type WhatsAppProvider } from '@/lib/whatsapp/provider';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';

vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: async () => ({ status: 'ok', values: new Map() }),
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async ({ original }: { original: string }) => ({ result: { redirect: false, to: original }, envLabel: 'TEST' }),
}));

/** #1389: the WAHA poll send and the poll.vote reader. */

let counter = 0;
function makeConfig(): WahaWhatsAppConfig {
  counter += 1;
  return {
    provider: 'waha',
    apiKey: 'waha-key',
    webhookSecret: 'secret',
    baseUrl: `https://waha-poll.test/${counter}`,
    session: 'default',
    fromNumber: '+2348037000101',
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const working = () => json({ status: 'WORKING', me: { id: '2348037000101@c.us' } });

describe('WAHA sendPoll', () => {
  it('posts /api/sendPoll with the session, chat id and a single-choice poll', async () => {
    const config = makeConfig();
    const fetchImpl = vi.fn().mockResolvedValueOnce(working()).mockResolvedValueOnce(json({ id: { _serialized: 'true_2348030000001@c.us_POLL1' } }, 201));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendPoll!({ to: '+2348030000001', name: 'Sign-in request', options: ['47', '12', '83', 'This is not me'] });

    expect(result).toEqual({ success: true, messageId: 'true_2348030000001@c.us_POLL1' });
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe(`${config.baseUrl}/api/sendPoll`);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      session: 'default',
      chatId: '2348030000001@c.us',
      poll: { name: 'Sign-in request', options: ['47', '12', '83', 'This is not me'], multipleAnswers: false },
    });
  });

  it('reports a disconnected session as a failure, without sending', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ status: 'STOPPED' }));
    const provider = createWahaWhatsAppProvider(makeConfig(), fetchImpl);
    const result = await provider.sendPoll!({ to: '+2348030000001', name: 'x', options: ['1', '2'] });
    expect(result.success).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('the seam fails cleanly for a provider without polls', async () => {
    const provider: WhatsAppProvider = { sendText: vi.fn(), sendTemplate: vi.fn() };
    const result = await sendWhatsAppPoll({ to: '+2348030000001', name: 'x', options: ['1'] }, provider);
    expect(result).toMatchObject({ success: false, retryable: false });
  });
});

describe('poll.vote reader', () => {
  const body = (vote: Record<string, unknown>, poll: Record<string, unknown> = { id: 'true_2348030000001@c.us_POLL1' }) => ({
    event: 'poll.vote',
    payload: { vote, poll },
  });

  it('reads the WEBJS shape', () => {
    expect(extractWahaPollVote(body({ selectedOptions: ['47'], from: '2348030000001@c.us', fromMe: false }))).toEqual({
      pollMessageId: 'true_2348030000001@c.us_POLL1',
      voterId: '2348030000001@c.us',
      selectedOptions: ['47'],
    });
  });

  it('reads a serialized poll id and a participant voter', () => {
    const vote = extractWahaPollVote(body({ selectedOptions: [{ name: '47' }], participant: '1234@lid' }, { id: { _serialized: 'true_x_POLL2' } }));
    expect(vote).toEqual({ pollMessageId: 'true_x_POLL2', voterId: '1234@lid', selectedOptions: [{ name: '47' }] });
  });

  it('ignores the handset\'s own vote and bodies without a poll id or voter', () => {
    expect(extractWahaPollVote(body({ selectedOptions: ['47'], from: '2348030000001@c.us', fromMe: true }))).toBeNull();
    expect(extractWahaPollVote(body({ selectedOptions: ['47'], from: '2348030000001@c.us' }, {}))).toBeNull();
    expect(extractWahaPollVote(body({ selectedOptions: ['47'], from: 'me' }))).toBeNull();
    expect(extractWahaPollVote({ event: 'poll.vote' })).toBeNull();
  });

  it('resolves an @lid voter only through a @c.us answer', async () => {
    expect(await resolveWahaVoterPhone('2348030000001@c.us', vi.fn())).toBe('+2348030000001');
    expect(await resolveWahaVoterPhone('99@lid', async () => '2348030000001@c.us')).toBe('+2348030000001');
    expect(await resolveWahaVoterPhone('99@lid', async () => null)).toBeNull();
    expect(await resolveWahaVoterPhone('99@lid', async () => '99@lid')).toBeNull();
    expect(await resolveWahaVoterPhone('99@lid', async () => { throw new Error('down'); })).toBeNull();
    expect(await resolveWahaVoterPhone('123@g.us', vi.fn())).toBeNull();
  });
});
