import { describe, expect, it, vi } from 'vitest';
import { generateTOTPCode, matchTotpStep, totpStepAt, validateTOTP } from '@/lib/auth/totp';
import {
  ADMIN_BAD_LINK_REPLY,
  ADMIN_CAP_REPLY,
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_NOT_LINKED_REPLY,
  ADMIN_WRONG_CODE_REPLY,
  accountFingerprint,
  bindingEndReason,
  handleWhatsAppAdminMessage,
  hashAdminLinkCode,
  parseWhatsAppAdminCommand,
  type WhatsAppAdminAccount,
  type WhatsAppAdminBinding,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const NOW = new Date('2026-10-22T10:00:00Z');
const PHONE = '+2348000000001';

const account: WhatsAppAdminAccount = {
  profileId: 'admin-1',
  fullName: 'Ada Admin',
  email: 'ada@example.test',
  approvalStatus: 'active',
  roleId: 'role-chair',
  roleName: 'chairman',
  roleDisplayName: 'Chairman',
  permissions: ['whatsapp_admin.query'],
  totpSecret: SECRET,
};

function binding(overrides: Partial<WhatsAppAdminBinding> = {}): WhatsAppAdminBinding {
  return {
    id: 'binding-1',
    profileId: account.profileId,
    phoneNumber: PHONE,
    boundAt: '2026-10-20T10:00:00Z',
    lastUsedAt: '2026-10-21T10:00:00Z',
    lastTotpStep: null,
    sessionExpiresAt: null,
    accountFingerprint: accountFingerprint(account),
    ...overrides,
  };
}

function message(text: string): WhatsAppInboundMessage {
  return { id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1760000000', type: 'text', text };
}

function repository(overrides: Partial<WhatsAppAdminRepository> = {}): WhatsAppAdminRepository {
  return {
    getLockedUntil: vi.fn().mockResolvedValue(null),
    recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }),
    clearWrongCodes: vi.fn().mockResolvedValue(undefined),
    findLinkCode: vi.fn().mockResolvedValue(null),
    activateBinding: vi.fn().mockResolvedValue(true),
    findActiveBinding: vi.fn().mockResolvedValue(binding()),
    revokeBinding: vi.fn().mockResolvedValue(undefined),
    loadAccount: vi.fn().mockResolvedValue(account),
    acceptCode: vi.fn().mockResolvedValue(true),
    touchBinding: vi.fn().mockResolvedValue(undefined),
    createRequest: vi.fn().mockResolvedValue('request-1'),
    takePendingRequest: vi.fn().mockResolvedValue(null),
    findPendingChoice: vi.fn().mockResolvedValue(null),
    countDoneSince: vi.fn().mockResolvedValue(0),
    audit: vi.fn().mockResolvedValue(undefined),
    emailAdmin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function send(text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const command = parseWhatsAppAdminCommand(text);
  if (!command) throw new Error(`not an admin command: ${text}`);
  await handleWhatsAppAdminMessage(message(text), command, { repository: repo, reply, now: () => NOW });
  return reply;
}

const currentCode = () => generateTOTPCode(SECRET, totpStepAt(NOW.getTime()));

describe('TOTP checker', () => {
  it('accepts the current, previous and next step only', () => {
    const step = totpStepAt(NOW.getTime());
    expect(matchTotpStep(generateTOTPCode(SECRET, step), SECRET, NOW.getTime())).toBe(step);
    expect(matchTotpStep(generateTOTPCode(SECRET, step - 1), SECRET, NOW.getTime())).toBe(step - 1);
    expect(matchTotpStep(generateTOTPCode(SECRET, step + 1), SECRET, NOW.getTime())).toBe(step + 1);
    expect(matchTotpStep(generateTOTPCode(SECRET, step - 2), SECRET, NOW.getTime())).toBeNull();
  });

  it('matches the RFC 6238 SHA-1 test vector', () => {
    // RFC 6238 appendix B, T = 59 s, secret "12345678901234567890", last 6 digits of 94287082.
    expect(generateTOTPCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
    expect(validateTOTP(generateTOTPCode(SECRET, totpStepAt()), SECRET)).toBe(true);
  });
});

describe('parseWhatsAppAdminCommand', () => {
  it('accepts only the exact admin forms', () => {
    expect(parseWhatsAppAdminCommand('admin')).toEqual({ kind: 'help' });
    expect(parseWhatsAppAdminCommand(' ADMIN LINK 123456 ')).toEqual({ kind: 'link', code: '123456' });
    expect(parseWhatsAppAdminCommand('Admin 654321')).toEqual({ kind: 'code', code: '654321' });
    expect(parseWhatsAppAdminCommand('admin status')).toEqual({ kind: 'action', action: 'status' });
    expect(parseWhatsAppAdminCommand('admin please call me')).toBeNull();
    expect(parseWhatsAppAdminCommand('ADMIN DELETE')).toBeNull();
    expect(parseWhatsAppAdminCommand('LINK 123456')).toBeNull();
    expect(parseWhatsAppAdminCommand('ADMIN 12345')).toBeNull();
  });
});

describe('bindingEndReason', () => {
  it('ends the binding on any account change and on age or silence', () => {
    expect(bindingEndReason(binding(), account, NOW)).toBeNull();
    expect(bindingEndReason(binding(), { ...account, approvalStatus: 'suspended' }, NOW)).toBe('account_inactive');
    expect(bindingEndReason(binding(), { ...account, roleName: 'security_officer' }, NOW)).toBe('role_not_allowed');
    expect(bindingEndReason(binding(), { ...account, permissions: [] }, NOW)).toBe('missing_permission');
    expect(bindingEndReason(binding(), { ...account, totpSecret: null }, NOW)).toBe('authenticator_off');
    expect(bindingEndReason(binding(), { ...account, totpSecret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' }, NOW)).toBe('account_changed');
    expect(bindingEndReason(binding(), { ...account, roleId: 'role-other' }, NOW)).toBe('account_changed');
    expect(bindingEndReason(binding({ boundAt: '2026-07-24T10:00:00Z', lastUsedAt: '2026-10-21T10:00:00Z' }), account, NOW)).toBe('reverify_due');
    expect(bindingEndReason(binding({ lastUsedAt: '2026-09-22T10:00:00Z', boundAt: '2026-09-01T10:00:00Z' }), account, NOW)).toBe('idle');
  });
});

describe('handleWhatsAppAdminMessage', () => {
  it('pins the number from a valid link code, audits it and emails the admin', async () => {
    const repo = repository({ findLinkCode: vi.fn().mockResolvedValue({ id: 'binding-new', profileId: account.profileId }) });
    const reply = await send('ADMIN LINK 123456', repo);

    expect(repo.findLinkCode).toHaveBeenCalledWith(hashAdminLinkCode('123456'), NOW);
    expect(repo.activateBinding).toHaveBeenCalledWith('binding-new', account.profileId, PHONE, accountFingerprint(account), NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', entityId: 'binding-new' }), account.profileId);
    expect(repo.emailAdmin).toHaveBeenCalledWith(account, 'linked', PHONE);
    expect(reply.mock.calls[0][0]).toMatch(/now linked/);
  });

  it('counts a bad link code as a wrong code', async () => {
    const repo = repository();
    const reply = await send('ADMIN LINK 123456', repo);
    expect(repo.recordWrongCode).toHaveBeenCalledWith(PHONE, NOW);
    expect(repo.activateBinding).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_BAD_LINK_REPLY);
  });

  it('refuses to pin for an account without authenticator 2FA', async () => {
    const repo = repository({
      findLinkCode: vi.fn().mockResolvedValue({ id: 'binding-new', profileId: account.profileId }),
      loadAccount: vi.fn().mockResolvedValue({ ...account, totpSecret: null }),
    });
    const reply = await send('ADMIN LINK 123456', repo);
    expect(repo.activateBinding).not.toHaveBeenCalled();
    expect(repo.revokeBinding).toHaveBeenCalledWith('binding-new', 'authenticator_off', NOW);
    expect(reply.mock.calls[0][0]).toMatch(/not linked/);
  });

  it('answers an unlinked number without running anything', async () => {
    const repo = repository({ findActiveBinding: vi.fn().mockResolvedValue(null) });
    const reply = await send('ADMIN STATUS', repo);
    expect(reply).toHaveBeenCalledWith(ADMIN_NOT_LINKED_REPLY);
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('holds a request without a session as a pending request until a code arrives', async () => {
    const repo = repository();
    const reply = await send('ADMIN STATUS', repo);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'status', status: 'pending', bindingId: 'binding-1' }));
    expect(reply.mock.calls[0][0]).toMatch(/authenticator app/);
    expect(reply.mock.calls[0][0]).not.toMatch(/Ada Admin/);
  });

  it('runs the pending request once a correct code opens a session', async () => {
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'request-9', action: 'status', params: {} }) });
    const reply = await send(`ADMIN ${currentCode()}`, repo);

    const step = totpStepAt(NOW.getTime());
    expect(repo.acceptCode).toHaveBeenCalledWith('binding-1', step, '2026-10-22T10:15:00.000Z', NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }), account.profileId);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VERIFY', entityId: 'request-9' }), account.profileId);
    const answer = reply.mock.calls[0][0];
    expect(answer).toContain('Name: Ada Admin');
    expect(answer).toContain('Role: Chairman');
    expect(answer).toContain('Session ends: 11:15 on 22 Oct 2026');
  });

  it('refuses a code whose step was already used', async () => {
    const step = totpStepAt(NOW.getTime());
    const repo = repository({ findActiveBinding: vi.fn().mockResolvedValue(binding({ lastTotpStep: step })) });
    const reply = await send(`ADMIN ${currentCode()}`, repo);
    expect(repo.acceptCode).not.toHaveBeenCalled();
    expect(repo.recordWrongCode).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_WRONG_CODE_REPLY);
  });

  it('refuses a code when the conditional write loses a race', async () => {
    const repo = repository({ acceptCode: vi.fn().mockResolvedValue(false) });
    const reply = await send(`ADMIN ${currentCode()}`, repo);
    expect(repo.takePendingRequest).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_WRONG_CODE_REPLY);
  });

  it('locks the number on the fifth wrong code and emails the admin', async () => {
    const repo = repository({ recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: '2026-10-22T10:30:00.000Z' }) });
    const wrong = currentCode() === '000000' ? '111111' : '000000';
    const reply = await send(`ADMIN ${wrong}`, repo);
    expect(repo.emailAdmin).toHaveBeenCalledWith(account, 'locked', PHONE);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }), account.profileId);
    expect(reply.mock.calls[0][0]).toMatch(/locked.*11:30 on 22 Oct 2026/);
  });

  it('answers nothing else while the number is locked', async () => {
    const repo = repository({ getLockedUntil: vi.fn().mockResolvedValue('2026-10-22T10:20:00.000Z') });
    const reply = await send(`ADMIN ${currentCode()}`, repo);
    expect(repo.findActiveBinding).not.toHaveBeenCalled();
    expect(repo.acceptCode).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(/locked/);
  });

  it('runs a request directly inside a live session', async () => {
    const repo = repository({ findActiveBinding: vi.fn().mockResolvedValue(binding({ sessionExpiresAt: '2026-10-22T10:05:00Z' })) });
    const reply = await send('ADMIN STATUS', repo);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
    expect(repo.touchBinding).toHaveBeenCalledWith('binding-1', NOW);
    expect(reply.mock.calls[0][0]).toContain('Session ends: 11:05 on 22 Oct 2026');
  });

  it('stops at the daily cap', async () => {
    const repo = repository({
      findActiveBinding: vi.fn().mockResolvedValue(binding({ sessionExpiresAt: '2026-10-22T10:05:00Z' })),
      countDoneSince: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP),
    });
    const reply = await send('ADMIN STATUS', repo);
    // Midnight in Lagos (UTC+1) is 23:00 UTC the day before.
    expect(repo.countDoneSince).toHaveBeenCalledWith(account.profileId, '2026-10-21T23:00:00.000Z');
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_CAP_REPLY);
  });

  it('ends the binding when the account changed', async () => {
    const repo = repository({ loadAccount: vi.fn().mockResolvedValue({ ...account, roleName: 'security_officer' }) });
    const reply = await send('ADMIN STATUS', repo);
    expect(repo.revokeBinding).toHaveBeenCalledWith('binding-1', 'role_not_allowed', NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEACTIVATE' }), account.profileId);
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(/has ended/);
  });
});
