import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOT_ME_OPTION,
  SIGN_IN_BLOCKED_REPLY,
  SIGN_IN_EXPIRED_REPLY,
  WHATSAPP_APPROVAL_TTL_MS,
  answerWhatsAppApprovalVote,
  closeWhatsAppApproval,
  consumeWhatsAppApprovalReply,
  getWhatsAppApprovalStatus,
  parseTypedAnswer,
  pickCodes,
  pollOptions,
  startWhatsAppApproval,
  summarizeUserAgent,
} from '@/lib/auth/two-factor-whatsapp';
import { createMemoryTwoFactorWhatsApp } from '@/__tests__/helpers/two-factor-whatsapp-memory';

/**
 * #1389: approve sign-ins on WhatsApp. The number on the screen must be tapped (or typed) from the
 * admin's linked phone, within 2 minutes; anything else never lets the session in.
 */

const ADMIN = 'admin-1';
const PHONE = '+2348030000001';
const SESSION = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION = '22222222-2222-4222-8222-222222222222';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

let mem: ReturnType<typeof createMemoryTwoFactorWhatsApp>;

async function start(sessionId: string | null = SESSION) {
  const result = await startWhatsAppApproval({ userId: ADMIN, sessionId, userAgent: CHROME }, mem.deps);
  if (!result.available || !result.success) throw new Error(`start failed: ${JSON.stringify(result)}`);
  const request = mem.requests[mem.requests.length - 1];
  return { result, request };
}

const vote = (pollMessageId: string, choice: unknown, voterPhone = PHONE) =>
  answerWhatsAppApprovalVote({ pollMessageId, voterPhone, selectedOptions: [choice] }, mem.deps);

const status = (sessionId: string | null = SESSION) => getWhatsAppApprovalStatus({ userId: ADMIN, sessionId }, mem.deps);

beforeEach(() => {
  mem = createMemoryTwoFactorWhatsApp();
  mem.addAccount({ profileId: ADMIN, phoneNumber: PHONE });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('starting a request', () => {
  it('creates a pending request for this session and sends a poll with the 3 numbers and "This is not me"', async () => {
    const { result, request } = await start();
    expect(request).toMatchObject({ profileId: ADMIN, sessionId: SESSION, status: 'pending' });
    expect(result.code).toBe(request.matchCode);
    expect(result.pollSent).toBe(true);
    expect(result.message).toBe(`Tap this number in WhatsApp. If you cannot tap, type ${request.matchCode} in the chat.`);
    expect(Date.parse(result.expiresAt) - Date.parse(request.createdAt)).toBe(WHATSAPP_APPROVAL_TTL_MS);

    const [to, name, options] = mem.sender.sendPoll.mock.calls[0] as unknown as [string, string, string[]];
    expect(to).toBe(PHONE);
    expect(name).toBe('Sign-in request: Chrome on Windows, 10:00. Tap the number on your screen.');
    expect(options).toHaveLength(4);
    expect(options[3]).toBe(NOT_ME_OPTION);
    expect([...options.slice(0, 3)].sort()).toEqual([request.matchCode, ...request.decoyCodes].sort());
    expect(mem.events.map((e) => e.event)).toEqual(['whatsapp_approval_requested']);
  });

  it.each([
    ['the switch is off', { approveSignIns: false }],
    ['no WhatsApp number is linked', { phoneNumber: null }],
    ['two-factor is off', { twoFactorEnabled: false }],
  ])('is not offered when %s', async (_label, change) => {
    mem.addAccount({ profileId: ADMIN, phoneNumber: PHONE, ...change });
    const result = await startWhatsAppApproval({ userId: ADMIN, sessionId: SESSION, userAgent: CHROME }, mem.deps);
    expect(result).toEqual({ available: false });
    expect(mem.requests).toHaveLength(0);
    expect(mem.sender.sendPoll).not.toHaveBeenCalled();
  });

  it('creates no request without a session id', async () => {
    const result = await startWhatsAppApproval({ userId: ADMIN, sessionId: null, userAgent: CHROME }, mem.deps);
    expect(result).toMatchObject({ available: true, success: false });
    expect(mem.requests).toHaveLength(0);
    expect(mem.sender.sendPoll).not.toHaveBeenCalled();
  });

  it('a new request supersedes the open one, and a vote on the old poll does nothing', async () => {
    const first = await start();
    const second = await start();
    expect(first.request.status).toBe('superseded');
    expect(second.request.status).toBe('pending');
    expect(mem.requests.filter((r) => r.status === 'pending')).toHaveLength(1);

    expect(await vote(first.request.pollMessageId!, first.request.matchCode)).toBe('ignored');
    expect(second.request.status).toBe('pending');
  });

  it('allows 5 requests in 15 minutes, then refuses', async () => {
    for (let i = 0; i < 5; i++) await start();
    const sixth = await startWhatsAppApproval({ userId: ADMIN, sessionId: SESSION, userAgent: CHROME }, mem.deps);
    expect(sixth).toMatchObject({ available: true, success: false });
    expect(mem.requests).toHaveLength(5);

    mem.advance(15 * 60 * 1000 + 1000);
    await start();
    expect(mem.requests).toHaveLength(6);
  });

  it('when the poll cannot be sent, the request stays open and a typed reply approves it', async () => {
    mem.sender.sendPoll.mockResolvedValueOnce({ success: false, error: 'This WhatsApp provider cannot send polls' } as never);
    const { result, request } = await start();
    expect(result.pollSent).toBe(false);
    expect(result.message).toContain(`Type ${request.matchCode} in your chat`);
    expect(request.status).toBe('pending');
    expect(request.pollMessageId).toBeNull();

    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: request.matchCode }, mem.deps)).toBe(true);
    expect(request.status).toBe('approved');
  });
});

describe('answering', () => {
  it('the right number approves, and the marker is allowed once, for the same session only', async () => {
    const { request } = await start();
    expect(await vote(request.pollMessageId!, request.matchCode)).toBe('approved');
    expect(request.status).toBe('approved');
    expect(mem.events.map((e) => e.event)).toContain('whatsapp_approval_approved');

    expect(await status(OTHER_SESSION)).toEqual({ status: 'none' });
    expect(request.markerIssuedAt).toBeNull();

    expect(await status()).toEqual({ status: 'approved', markerAllowed: true, requestId: request.id });
    expect(await status()).toEqual({ status: 'approved', markerAllowed: false, requestId: request.id });
  });

  it('a decoy number denies, sends "Sign-in blocked" and alerts the Chairman', async () => {
    const { request } = await start();
    expect(await vote(request.pollMessageId!, request.decoyCodes[0])).toBe('denied');
    expect(request.status).toBe('denied');
    expect(mem.sender.sendText).toHaveBeenCalledWith(PHONE, SIGN_IN_BLOCKED_REPLY);
    expect(mem.sender.alertChairman).toHaveBeenCalledTimes(1);
    expect(mem.events.find((e) => e.event === 'whatsapp_approval_denied')?.metadata).toMatchObject({ reason: 'wrong_number', via: 'poll' });
    expect(await status()).toEqual({ status: 'denied' });
  });

  it('"This is not me" denies', async () => {
    const { request } = await start();
    expect(await vote(request.pollMessageId!, NOT_ME_OPTION)).toBe('denied');
    expect(mem.events.find((e) => e.event === 'whatsapp_approval_denied')?.metadata).toMatchObject({ reason: 'not_me' });
    expect(mem.sender.alertChairman).toHaveBeenCalledTimes(1);
  });

  it('reads a NOWEB-style { name } option and a poll id whose chat part differs (an @lid)', async () => {
    const { request } = await start();
    const key = request.pollMessageId!.split('_').pop();
    expect(await vote(`true_99999999@lid_${key}`, { name: request.matchCode })).toBe('approved');
  });

  it('a vote from another phone is ignored and the request stays open', async () => {
    const { request } = await start();
    expect(await vote(request.pollMessageId!, request.matchCode, '+2348099999999')).toBe('ignored');
    expect(request.status).toBe('pending');
    expect(await status()).toMatchObject({ status: 'pending' });
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
  });

  it('a multi-select vote is ignored', async () => {
    const { request } = await start();
    expect(
      await answerWhatsAppApprovalVote(
        { pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: [request.matchCode, request.decoyCodes[0]] },
        mem.deps
      )
    ).toBe('ignored');
    expect(request.status).toBe('pending');
  });

  it('an option that is not one of the request\'s is ignored, not denied', async () => {
    const { request } = await start();
    const unknown = ['10', '11', '12', '13'].find((c) => c !== request.matchCode && !request.decoyCodes.includes(c))!;
    expect(await vote(request.pollMessageId!, unknown)).toBe('ignored');
    expect(await vote(request.pollMessageId!, 'Maybe later')).toBe('ignored');
    expect(request.status).toBe('pending');
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
  });

  it('an empty vote (a vote taken back) is ignored', async () => {
    const { request } = await start();
    expect(await answerWhatsAppApprovalVote({ pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: [] }, mem.deps)).toBe('ignored');
    expect(request.status).toBe('pending');
  });

  it('after 2 minutes the right number does not approve: the request expires with a short reply', async () => {
    const { request } = await start();
    mem.advance(WHATSAPP_APPROVAL_TTL_MS);
    expect(await vote(request.pollMessageId!, request.matchCode)).toBe('expired');
    expect(request.status).toBe('expired');
    expect(mem.sender.sendText).toHaveBeenCalledWith(PHONE, SIGN_IN_EXPIRED_REPLY);
    expect(await status()).toEqual({ status: 'expired' });
    expect(mem.events.map((e) => e.event)).toContain('whatsapp_approval_expired');
  });

  it('the status call expires an unanswered request after 2 minutes', async () => {
    const { request } = await start();
    mem.advance(WHATSAPP_APPROVAL_TTL_MS - 1000);
    expect(await status()).toMatchObject({ status: 'pending' });
    mem.advance(1000);
    expect(await status()).toEqual({ status: 'expired' });
    expect(request.status).toBe('expired');
  });

  it('a decision is final: a later vote cannot turn a denial into an approval', async () => {
    const { request } = await start();
    await vote(request.pollMessageId!, NOT_ME_OPTION);
    expect(await vote(request.pollMessageId!, request.matchCode)).toBe('ignored');
    expect(request.status).toBe('denied');
  });
});

describe('status', () => {
  it('returns none without a session id', async () => {
    await start();
    expect(await status(null)).toEqual({ status: 'none' });
  });
});

describe('signing in another way (#1389 QA D1)', () => {
  it('closing the request quietly makes a later reply or vote go nowhere: no block, no alert', async () => {
    const { request } = await start();
    await closeWhatsAppApproval({ userId: ADMIN, sessionId: SESSION }, mem.deps);
    expect(request.status).toBe('superseded');

    const wrong = ['10', '11', '12'].find((c) => c !== request.matchCode)!;
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: wrong }, mem.deps)).toBe(false);
    expect(await vote(request.pollMessageId!, request.decoyCodes[0])).toBe('ignored');
    expect(mem.sender.sendText).not.toHaveBeenCalled();
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
    expect(mem.events.map((e) => e.event)).not.toContain('whatsapp_approval_denied');
  });

  it("closes only that session's request when a session id is given", async () => {
    const { request } = await start();
    await closeWhatsAppApproval({ userId: ADMIN, sessionId: OTHER_SESSION }, mem.deps);
    expect(request.status).toBe('pending');
  });
});

describe('typed replies', () => {
  it('the typed right number approves; NO and a wrong number deny', async () => {
    let { request } = await start();
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: ` ${request.matchCode} ` }, mem.deps)).toBe(true);
    expect(request.status).toBe('approved');

    ({ request } = await start(OTHER_SESSION));
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: 'NO' }, mem.deps)).toBe(true);
    expect(request.status).toBe('denied');

    ({ request } = await start());
    const wrong = ['10', '11', '12'].find((c) => c !== request.matchCode)!;
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: wrong }, mem.deps)).toBe(true);
    expect(request.status).toBe('denied');
  });

  it('is not consumed without a pending request, from another phone, or when it is not an answer', async () => {
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: '47' }, mem.deps)).toBe(false);
    const { request } = await start();
    expect(await consumeWhatsAppApprovalReply({ from: '+2348099999999', text: request.matchCode }, mem.deps)).toBe(false);
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: '1' }, mem.deps)).toBe(false);
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: 'menu' }, mem.deps)).toBe(false);
    expect(request.status).toBe('pending');
  });

  it('an expired request does not swallow a typed reply: it goes to the menu and the row is expired quietly', async () => {
    const { request } = await start();
    mem.advance(WHATSAPP_APPROVAL_TTL_MS);
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: request.matchCode }, mem.deps)).toBe(false);
    expect(request.status).toBe('expired');
    expect(mem.sender.sendText).not.toHaveBeenCalled();
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
  });

  it('a reply minutes after expiry also goes to the menu', async () => {
    const { request } = await start();
    mem.advance(5 * 60 * 1000);
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: 'NO' }, mem.deps)).toBe(false);
    expect(request.status).not.toBe('denied');
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
  });

  it.each([
    ['47', { kind: 'code', code: '47' }],
    [' 47. ', { kind: 'code', code: '47' }],
    ['no', { kind: 'not_me' }],
    ['Not me!', { kind: 'not_me' }],
    ['This is not me', { kind: 'not_me' }],
    ['1', null],
    ['470', null],
    ['nope', null],
    [null, null],
  ])('parses %j', (text, expected) => {
    expect(parseTypedAnswer(text)).toEqual(expected);
  });
});

describe('helpers', () => {
  it('picks 3 different 2-digit codes', () => {
    for (let i = 0; i < 50; i++) {
      const { matchCode, decoyCodes } = pickCodes();
      const all = [matchCode, ...decoyCodes];
      expect(new Set(all).size).toBe(3);
      for (const code of all) expect(code).toMatch(/^[1-9]\d$/);
    }
  });

  it('puts the 3 numbers in random order and "This is not me" last', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(pollOptions('47', ['12', '83']).slice(0, 3).join(','));
    expect(seen.size).toBeGreaterThan(1);
    expect(pollOptions('47', ['12', '83'])[3]).toBe(NOT_ME_OPTION);
  });

  it.each([
    [CHROME, 'Chrome on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge on Windows'],
    [null, null],
  ])('summarises %s', (ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected);
  });
});
