import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryTwoFactorWhatsApp } from '@/__tests__/helpers/two-factor-whatsapp-memory';

/**
 * #1389: the start and status routes behind the verify page. The user and session come from the
 * session cookie only; the marker is set for the request's own session, once.
 */

const mocks = vi.hoisted(() => ({
  session: null as { userId: string; sessionId: string | null } | null,
  issued: 0,
  issueResult: true,
  mem: null as unknown,
}));

vi.mock('@/lib/auth/two-factor-session', () => ({
  getTwoFactorSessionContext: async () => mocks.session,
  issueTwoFactorMarkerCookie: async () => {
    mocks.issued += 1;
    return mocks.issueResult;
  },
}));
vi.mock('@/lib/auth/two-factor-guard', () => ({ clearTwoFactorTries: async () => {} }));
vi.mock('@/actions/two-factor/verify', () => ({
  verifyTwoFactorCode: async () => ({ success: true, verified: true, message: 'Verification successful' }),
  verifyBackupCode: async () => ({ success: true, verified: true, message: 'Backup code verified' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}));
vi.mock('@/lib/auth/two-factor-whatsapp-store', () => ({
  createTwoFactorWhatsAppDeps: () => (mocks.mem as ReturnType<typeof createMemoryTwoFactorWhatsApp>).deps,
}));

import { POST as start } from '@/app/api/auth/2fa/whatsapp/start/route';
import { GET as status } from '@/app/api/auth/2fa/whatsapp/status/route';
import { POST as verifyCode } from '@/app/api/auth/2fa/verify/route';
import { POST as verifyBackup } from '@/app/api/auth/2fa/verify-backup/route';
import { POST as cancel } from '@/app/api/auth/2fa/whatsapp/cancel/route';
import { answerWhatsAppApprovalVote, consumeWhatsAppApprovalReply } from '@/lib/auth/two-factor-whatsapp';

const ADMIN = 'admin-1';
const PHONE = '+2348030000001';
const SESSION = 'session-a';

let mem: ReturnType<typeof createMemoryTwoFactorWhatsApp>;

const startRequest = (body: unknown = {}) =>
  start(new NextRequest('http://localhost/api/auth/2fa/whatsapp/start', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  mem = createMemoryTwoFactorWhatsApp();
  mem.addAccount({ profileId: ADMIN, phoneNumber: PHONE });
  mem.addAccount({ profileId: 'victim', phoneNumber: '+2348030000002' });
  mocks.mem = mem;
  mocks.session = { userId: ADMIN, sessionId: SESSION };
  mocks.issued = 0;
  mocks.issueResult = true;
});

describe('start route', () => {
  it('refuses without a session', async () => {
    mocks.session = null;
    const response = await startRequest();
    expect(response.status).toBe(401);
    expect(mem.requests).toHaveLength(0);
  });

  it('creates the request for the session user, never a user named in the body (#455)', async () => {
    const response = await startRequest({ userId: 'victim' });
    const body = await response.json();
    expect(body).toMatchObject({ available: true, success: true, pollSent: true });
    expect(mem.requests.map((r) => [r.profileId, r.sessionId])).toEqual([[ADMIN, SESSION]]);
  });
});

describe('status route', () => {
  it('sets the marker once after approval, for the session that made the request', async () => {
    await startRequest();
    const request = mem.requests[0];
    expect(await (await status()).json()).toMatchObject({ status: 'pending' });
    expect(mocks.issued).toBe(0);

    await answerWhatsAppApprovalVote({ pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: [request.matchCode] }, mem.deps);

    // Another login session of the same user sees nothing and gets no marker.
    mocks.session = { userId: ADMIN, sessionId: 'session-b' };
    expect(await (await status()).json()).toEqual({ status: 'none' });
    expect(mocks.issued).toBe(0);

    mocks.session = { userId: ADMIN, sessionId: SESSION };
    expect(await (await status()).json()).toEqual({ status: 'approved' });
    expect(mocks.issued).toBe(1);

    // One-shot: the same approval cannot set the marker again.
    expect(await (await status()).json()).toMatchObject({ status: 'used' });
    expect(mocks.issued).toBe(1);
  });

  it('gives the claim back when the marker cannot be set, so a retry can finish', async () => {
    await startRequest();
    const request = mem.requests[0];
    await answerWhatsAppApprovalVote({ pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: [request.matchCode] }, mem.deps);

    mocks.issueResult = false;
    expect((await status()).status).toBe(500);
    expect(request.markerIssuedAt).toBeNull();

    mocks.issueResult = true;
    expect(await (await status()).json()).toEqual({ status: 'approved' });
  });

  it('a denied request never sets the marker', async () => {
    await startRequest();
    const request = mem.requests[0];
    await answerWhatsAppApprovalVote({ pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: ['This is not me'] }, mem.deps);
    expect(await (await status()).json()).toEqual({ status: 'denied' });
    expect(mocks.issued).toBe(0);
  });
});

describe('finishing another way closes the open request (#1389 QA D1)', () => {
  const codeBody = (code: string) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ code }) });

  it.each([
    ['an authenticator code', () => verifyCode(codeBody('123456'))],
    ['a backup code', () => verifyBackup(codeBody('AAAA1111'))],
    ['Cancel and Sign Out', () => cancel()],
  ])('after %s, a later 2-digit reply goes to the menu and nobody is alerted', async (_label, finish) => {
    await startRequest();
    const request = mem.requests[0];

    expect((await finish()).status).toBe(200);
    expect(request.status).toBe('superseded');

    const wrong = ['10', '11', '12'].find((c) => c !== request.matchCode)!;
    expect(await consumeWhatsAppApprovalReply({ from: PHONE, text: wrong }, mem.deps)).toBe(false);
    expect(await answerWhatsAppApprovalVote({ pollMessageId: request.pollMessageId!, voterPhone: PHONE, selectedOptions: [request.decoyCodes[0]] }, mem.deps)).toBe('ignored');
    expect(mem.sender.sendText).not.toHaveBeenCalled();
    expect(mem.sender.alertChairman).not.toHaveBeenCalled();
  });

  it("leaves another session's request open", async () => {
    await startRequest();
    mocks.session = { userId: ADMIN, sessionId: 'session-b' };
    await verifyCode(codeBody('123456'));
    expect(mem.requests[0].status).toBe('pending');
  });

  it('does not close the request when the marker cannot be set', async () => {
    await startRequest();
    mocks.issueResult = false;
    expect((await verifyCode(codeBody('123456'))).status).toBe(500);
    expect(mem.requests[0].status).toBe('pending');
  });
});
