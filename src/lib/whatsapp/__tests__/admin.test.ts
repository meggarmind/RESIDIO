import { describe, expect, it, vi } from 'vitest';
import { generateTOTPCode, matchTotpStep, totpStepAt, validateTOTP } from '@/lib/auth/totp';
import {
  ADMIN_BAD_LINK_REPLY,
  adminCapReply,
  resolveAdminDailyCap,
  ADMIN_CODE_NODE,
  ADMIN_CODE_PROMPT,
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_ITEM_NODE,
  ADMIN_LOCKED_REPLY,
  ADMIN_MENU_NODE,
  ADMIN_WRONG_CODE_REPLY,
  WHATSAPP_ADMIN_ACTIONS,
  accountFingerprint,
  adminIneligibility,
  bindingEndReason,
  createWhatsAppAdminTools,
  handleWhatsAppAdminMessage,
  handleWhatsAppAdminStep,
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
const LIVE_UNTIL = '2026-10-22T10:05:00Z';

const account: WhatsAppAdminAccount = {
  profileId: 'admin-1',
  fullName: 'Ada Admin',
  email: 'ada@example.test',
  approvalStatus: 'active',
  roleId: 'role-chair',
  roleName: 'chairman',
  roleDisplayName: 'Chairman',
  roleCategory: 'exco',
  permissions: ['whatsapp_admin.query', 'whatsapp_admin.resident_status', 'whatsapp_admin.debt_report'],
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
    codeRequired: true,
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
    getCodeRequired: vi.fn().mockResolvedValue(true),
    getDailyCap: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP),
    findAutoLinkProfile: vi.fn().mockResolvedValue(null),
    createBinding: vi.fn().mockImplementation(async (input) => binding({ id: 'binding-auto', lastTotpStep: input.totpStep, sessionExpiresAt: input.sessionExpiresAt })),
    setSessionExpiry: vi.fn().mockResolvedValue(undefined),
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

/** A repository for a number with no binding whose resident record belongs to an admin profile (#1292 item 6). */
const autoLinkRepository = (overrides: Partial<WhatsAppAdminRepository> = {}) =>
  repository({ findActiveBinding: vi.fn().mockResolvedValue(null), findAutoLinkProfile: vi.fn().mockResolvedValue(account.profileId), ...overrides });

const liveSession = (overrides: Partial<WhatsAppAdminRepository> = {}) =>
  repository({ findActiveBinding: vi.fn().mockResolvedValue(binding({ sessionExpiresAt: LIVE_UNTIL })), ...overrides });

async function send(text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const setStep = vi.fn().mockResolvedValue(undefined);
  const command = parseWhatsAppAdminCommand(text);
  if (!command) throw new Error(`not an admin command: ${text}`);
  const handled = await handleWhatsAppAdminMessage(message(text), command, { repository: repo, reply, setStep, now: () => NOW });
  return { reply, setStep, handled };
}

async function step(node: string, text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const setStep = vi.fn().mockResolvedValue(undefined);
  const handled = await handleWhatsAppAdminStep(message(text), node, { repository: repo, reply, setStep, now: () => NOW });
  return { reply, setStep, handled };
}

const currentCode = () => generateTOTPCode(SECRET, totpStepAt(NOW.getTime()));
const wrongCode = () => (currentCode() === '000000' ? '111111' : '000000');

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

describe('parseWhatsAppAdminCommand (#1292 item 7)', () => {
  it('keeps ADMIN, ADMIN LINK <code> and ADMIN <code> only', () => {
    expect(parseWhatsAppAdminCommand(' admin ')).toEqual({ kind: 'open' });
    expect(parseWhatsAppAdminCommand(' ADMIN LINK 123456 ')).toEqual({ kind: 'link', code: '123456' });
    expect(parseWhatsAppAdminCommand('Admin 654321')).toEqual({ kind: 'code', code: '654321' });
    for (const removed of ['ADMIN STATUS', 'ADMIN HELP', 'ADMIN OWES KOA-18A', 'ADMIN DEBT', 'ADMIN 2', 'admin please call me', 'LINK 123456', 'ADMIN 12345']) {
      expect(parseWhatsAppAdminCommand(removed)).toBeNull();
    }
  });
});

describe('the live admin check (#1292 item 2)', () => {
  it('allows every staff role holding whatsapp_admin.query, and no resident role', () => {
    expect(adminIneligibility({ ...account, roleName: 'security_officer', roleCategory: 'exco' })).toBeNull();
    expect(adminIneligibility({ ...account, roleName: 'trustee', roleCategory: 'bot' })).toBeNull();
    expect(adminIneligibility({ ...account, roleName: 'security_guard_supervisor', roleCategory: 'staff' })).toBeNull();
    expect(adminIneligibility({ ...account, roleName: 'resident_rep', roleCategory: 'resident' })).toBe('role_not_allowed');
    expect(adminIneligibility({ ...account, roleCategory: null })).toBe('role_not_allowed');
    expect(adminIneligibility({ ...account, permissions: ['whatsapp_admin.resident_status'] })).toBe('missing_permission');
  });

  it('needs the authenticator only when a code is needed', () => {
    expect(adminIneligibility({ ...account, totpSecret: null })).toBe('authenticator_off');
    expect(adminIneligibility({ ...account, totpSecret: null }, false)).toBeNull();
  });

  it('ends the binding on any account change and on age or silence', () => {
    expect(bindingEndReason(binding(), account, NOW)).toBeNull();
    expect(bindingEndReason(binding(), { ...account, approvalStatus: 'suspended' }, NOW)).toBe('account_inactive');
    expect(bindingEndReason(binding(), { ...account, roleCategory: 'resident' }, NOW)).toBe('role_not_allowed');
    expect(bindingEndReason(binding(), { ...account, permissions: [] }, NOW)).toBe('missing_permission');
    expect(bindingEndReason(binding(), { ...account, totpSecret: null }, NOW)).toBe('authenticator_off');
    expect(bindingEndReason(binding(), { ...account, totpSecret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' }, NOW)).toBe('account_changed');
    expect(bindingEndReason(binding(), { ...account, roleId: 'role-other' }, NOW)).toBe('account_changed');
    expect(bindingEndReason(binding({ boundAt: '2026-07-24T10:00:00Z', lastUsedAt: '2026-10-21T10:00:00Z' }), account, NOW)).toBe('reverify_due');
    expect(bindingEndReason(binding({ lastUsedAt: '2026-09-22T10:00:00Z', boundAt: '2026-09-01T10:00:00Z' }), account, NOW)).toBe('idle');
  });
});

describe('ADMIN LINK', () => {
  it('pins the number from a valid link code, audits it and emails the admin', async () => {
    const repo = repository({ findLinkCode: vi.fn().mockResolvedValue({ id: 'binding-new', profileId: account.profileId }) });
    const { reply, setStep } = await send('ADMIN LINK 123456', repo);

    expect(repo.findLinkCode).toHaveBeenCalledWith(hashAdminLinkCode('123456'), NOW);
    expect(repo.activateBinding).toHaveBeenCalledWith('binding-new', account.profileId, PHONE, accountFingerprint(account), NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', entityId: 'binding-new' }), account.profileId);
    expect(repo.emailAdmin).toHaveBeenCalledWith(account, 'linked', PHONE);
    expect(reply.mock.calls[0][0]).toMatch(/now linked.*Reply ADMIN/);
    expect(setStep).toHaveBeenCalledWith('main');
  });

  it('counts a bad link code as a wrong code', async () => {
    const repo = repository();
    const { reply } = await send('ADMIN LINK 123456', repo);
    expect(repo.recordWrongCode).toHaveBeenCalledWith(PHONE, NOW);
    expect(repo.activateBinding).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_BAD_LINK_REPLY);
  });

  it('refuses to pin for an account without authenticator 2FA', async () => {
    const repo = repository({
      findLinkCode: vi.fn().mockResolvedValue({ id: 'binding-new', profileId: account.profileId }),
      loadAccount: vi.fn().mockResolvedValue({ ...account, totpSecret: null }),
    });
    const { reply } = await send('ADMIN LINK 123456', repo);
    expect(repo.activateBinding).not.toHaveBeenCalled();
    expect(repo.revokeBinding).toHaveBeenCalledWith('binding-new', 'authenticator_off', NOW);
    expect(reply.mock.calls[0][0]).toMatch(/not linked/);
  });
});

describe('a number that is not an admin number (#1292 decision 1)', () => {
  it.each(['ADMIN', 'ADMIN 123456'])('leaves %s to the resident assistant and reveals nothing', async (text) => {
    const repo = repository({ findActiveBinding: vi.fn().mockResolvedValue(null) });
    const { reply, handled } = await send(text, repo);
    expect(handled).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    expect(repo.recordWrongCode).not.toHaveBeenCalled();
    expect(repo.getLockedUntil).not.toHaveBeenCalled();
  });

  it('does not treat a resident record of an ineligible profile as an admin', async () => {
    const repo = autoLinkRepository({ loadAccount: vi.fn().mockResolvedValue({ ...account, roleCategory: 'resident' }) });
    const { handled } = await send('ADMIN', repo);
    expect(handled).toBe(false);
    expect(repo.createBinding).not.toHaveBeenCalled();
  });

  it('hides item 6, not even locked', async () => {
    const tools = createWhatsAppAdminTools(repository({ findActiveBinding: vi.fn().mockResolvedValue(null) }), () => NOW);
    expect(await tools.menuLabel(PHONE)).toBeNull();
  });
});

describe('opening Admin tools with the code on (#1292 item 3)', () => {
  it('asks for the code, typed alone, when no session is open', async () => {
    const { reply, setStep, handled } = await send('ADMIN', repository());
    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith(ADMIN_CODE_PROMPT);
    expect(setStep).toHaveBeenCalledWith(ADMIN_CODE_NODE);
  });

  it('a good code opens the 15-minute session and shows the menu for this role', async () => {
    const repo = repository();
    const { reply, setStep } = await step(ADMIN_CODE_NODE, currentCode(), repo);

    expect(repo.acceptCode).toHaveBeenCalledWith('binding-1', totpStepAt(NOW.getTime()), '2026-10-22T10:15:00.000Z', NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }), account.profileId);
    const menu = reply.mock.calls[0][0] as string;
    expect(menu).toContain('🛠️ Admin tools: Ada Admin, Chairman');
    expect(menu).toContain('Session ends 11:15');
    expect(menu).toContain('1. 🏠 Resident status');
    expect(menu).toContain('2. 📄 Security debt status');
    expect(menu).toContain('Reply 0 for menu or LOCK to lock now.');
    expect(setStep).toHaveBeenCalledWith(ADMIN_MENU_NODE);
  });

  it('opens the menu straight away inside a live session', async () => {
    const { reply, setStep } = await send('ADMIN', liveSession());
    expect(reply.mock.calls[0][0]).toContain('Admin tools: Ada Admin, Chairman');
    expect(setStep).toHaveBeenCalledWith(ADMIN_MENU_NODE);
  });

  it('refuses a code whose step was already used', async () => {
    const repo = repository({ findActiveBinding: vi.fn().mockResolvedValue(binding({ lastTotpStep: totpStepAt(NOW.getTime()) })) });
    const { reply } = await step(ADMIN_CODE_NODE, currentCode(), repo);
    expect(repo.acceptCode).not.toHaveBeenCalled();
    expect(repo.recordWrongCode).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_WRONG_CODE_REPLY);
  });

  it('refuses a code when the conditional write loses a race', async () => {
    const repo = repository({ acceptCode: vi.fn().mockResolvedValue(false) });
    const { reply } = await send(`ADMIN ${currentCode()}`, repo);
    expect(repo.takePendingRequest).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(ADMIN_WRONG_CODE_REPLY);
  });

  it('locks the number on the fifth wrong code and emails the admin', async () => {
    const repo = repository({ recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: '2026-10-22T10:30:00.000Z' }) });
    const { reply, setStep } = await step(ADMIN_CODE_NODE, wrongCode(), repo);
    expect(repo.emailAdmin).toHaveBeenCalledWith(account, 'locked', PHONE);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }), account.profileId);
    expect(reply.mock.calls[0][0]).toMatch(/locked.*11:30 on 22 Oct 2026/);
    expect(setStep).toHaveBeenCalledWith('main');
  });

  it('answers nothing else while the number is locked', async () => {
    const repo = repository({ getLockedUntil: vi.fn().mockResolvedValue('2026-10-22T10:20:00.000Z') });
    const { reply } = await step(ADMIN_CODE_NODE, currentCode(), repo);
    expect(repo.acceptCode).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(/locked/);
  });

  it('keeps the code step on screen for text that is not a code', async () => {
    const { reply, handled } = await step(ADMIN_CODE_NODE, 'what?', repository());
    expect(handled).toBe(true);
    expect(reply.mock.calls[0][0]).toContain(ADMIN_CODE_PROMPT);
  });

  it('labels item 6 as needing the code, or unlocked inside a session', async () => {
    expect(await createWhatsAppAdminTools(repository(), () => NOW).menuLabel(PHONE)).toBe('Admin tools (code needed)');
    expect(await createWhatsAppAdminTools(liveSession(), () => NOW).menuLabel(PHONE)).toBe('Admin tools (unlocked)');
  });
});

describe('opening Admin tools with the code off (#1292 item 3)', () => {
  it.each([
    ['the global switch is off', () => ({ getCodeRequired: vi.fn().mockResolvedValue(false) })],
    ["the admin's own switch is off", () => ({ findActiveBinding: vi.fn().mockResolvedValue(binding({ codeRequired: false })) })],
  ])('opens the menu directly when %s, and the session still ends in 15 minutes', async (_label, overrides) => {
    const repo = repository(overrides());
    const { reply, setStep } = await send('ADMIN', repo);
    expect(repo.setSessionExpiry).toHaveBeenCalledWith('binding-1', '2026-10-22T10:15:00.000Z', NOW);
    expect(repo.acceptCode).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toContain('Session ends 11:15');
    expect(reply.mock.calls[0][0]).not.toContain('6-digit code');
    expect(setStep).toHaveBeenCalledWith(ADMIN_MENU_NODE);
    expect(await createWhatsAppAdminTools(repository(overrides()), () => NOW).menuLabel(PHONE)).toBe('Admin tools');
  });

  it('works without an authenticator when no code is needed', async () => {
    const noAuthenticator = { ...account, totpSecret: null };
    const repo = repository({
      getCodeRequired: vi.fn().mockResolvedValue(false),
      loadAccount: vi.fn().mockResolvedValue(noAuthenticator),
      findActiveBinding: vi.fn().mockResolvedValue(binding({ accountFingerprint: accountFingerprint(noAuthenticator) })),
    });
    const { reply } = await send('ADMIN', repo);
    expect(repo.revokeBinding).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toContain('Admin tools: Ada Admin');
  });

  it('ends the admin session when it runs out, even with no code needed', async () => {
    const repo = repository({ getCodeRequired: vi.fn().mockResolvedValue(false) });
    const { reply, setStep } = await step(ADMIN_MENU_NODE, '1', repo);
    expect(reply.mock.calls[0][0]).toMatch(/session has ended/);
    expect(setStep).toHaveBeenCalledWith('main');
    expect(repo.createRequest).not.toHaveBeenCalled();
  });
});

describe('the Admin tools menu (#1292 item 4)', () => {
  it('lists only the items the role may use, and a hidden number reads as unrecognised', async () => {
    const repo = liveSession({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query', 'whatsapp_admin.resident_status'] }) });
    const { reply } = await send('ADMIN', repo);
    expect(reply.mock.calls[0][0]).toContain('1. 🏠 Resident status');
    expect(reply.mock.calls[0][0]).not.toContain('Security debt status');

    const hidden = await step(ADMIN_MENU_NODE, '2', repo);
    expect(hidden.reply.mock.calls[0][0]).toMatch(/^I didn't catch that/);
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('opens Resident status as a question on screen', async () => {
    const repo = liveSession();
    const { reply, setStep } = await step(ADMIN_MENU_NODE, '1', repo);
    expect(reply.mock.calls[0][0]).toMatch(/^Resident status\. Send a house code or a name/);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'owes:choose', status: 'pending' }));
    expect(setStep).toHaveBeenCalledWith(ADMIN_ITEM_NODE);
  });

  it('LOCK ends the admin session', async () => {
    const repo = liveSession();
    const { reply, setStep } = await step(ADMIN_MENU_NODE, 'lock', repo);
    expect(repo.setSessionExpiry).toHaveBeenCalledWith('binding-1', null, NOW);
    expect(reply).toHaveBeenCalledWith(ADMIN_LOCKED_REPLY);
    expect(setStep).toHaveBeenCalledWith('main');
  });

  it('0 leaves for the resident main menu', async () => {
    const { reply, setStep, handled } = await step(ADMIN_MENU_NODE, '0', liveSession());
    expect(handled).toBe(false);
    expect(reply).not.toHaveBeenCalled();
    expect(setStep).toHaveBeenCalledWith('main');
  });

  it('0 on an item question goes back to the Admin tools menu', async () => {
    const { reply, setStep, handled } = await step(ADMIN_ITEM_NODE, '0', liveSession());
    expect(handled).toBe(true);
    expect(reply.mock.calls[0][0]).toContain('Admin tools: Ada Admin');
    expect(setStep).toHaveBeenCalledWith(ADMIN_MENU_NODE);
  });

  it('stops at the daily cap', async () => {
    const repo = liveSession({ countDoneSince: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP) });
    const { reply } = await step(ADMIN_MENU_NODE, '1', repo);
    // Midnight in Lagos (UTC+1) is 23:00 UTC the day before.
    expect(repo.countDoneSince).toHaveBeenCalledWith(account.profileId, '2026-10-21T23:00:00.000Z');
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${adminCapReply(ADMIN_DAILY_ACTION_CAP)}`));
  });

  describe('daily limit per role (#1298)', () => {
    const setting = { chairman: 2, financial_officer: 100 };
    const perRole = (done: number) =>
      liveSession({
        countDoneSince: vi.fn().mockResolvedValue(done),
        getDailyCap: vi.fn((roleName: string | null) => Promise.resolve(resolveAdminDailyCap(setting, roleName))),
      });

    it('stops an admin at their own role limit and says what it is', async () => {
      const repo = perRole(2);
      const { reply } = await step(ADMIN_MENU_NODE, '1', repo);
      expect(repo.getDailyCap).toHaveBeenCalledWith('chairman');
      expect(repo.createRequest).not.toHaveBeenCalled();
      expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${adminCapReply(2)}`));
    });

    it('lets the same count through when the role limit is higher', async () => {
      const repo = perRole(1);
      const { reply } = await step(ADMIN_MENU_NODE, '1', repo);
      expect(reply.mock.calls[0][0]).not.toContain("today's limit");
    });

    it('reads the limit of the admin role, not another role', () => {
      expect(resolveAdminDailyCap(setting, 'chairman')).toBe(2);
      expect(resolveAdminDailyCap(setting, 'financial_officer')).toBe(100);
      expect(resolveAdminDailyCap(setting, 'trustee')).toBe(ADMIN_DAILY_ACTION_CAP);
    });

    it.each([
      ['no setting', null],
      ['a JSON string', '{"chairman":3}'],
      ['a bad value', { chairman: 'lots' }],
      ['a negative value', { chairman: -1 }],
      ['an array', [1, 2]],
      ['broken JSON', '{nope'],
    ])('falls back safely for %s', (_label, value) => {
      const expected = _label === 'a JSON string' ? 3 : ADMIN_DAILY_ACTION_CAP;
      expect(resolveAdminDailyCap(value, 'chairman')).toBe(expected);
    });
  });

  it('runs the pending request once a correct code opens a session', async () => {
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'request-9', action: 'debt', params: { all: true } }) });
    const run = vi.spyOn(WHATSAPP_ADMIN_ACTIONS.debt, 'run').mockResolvedValue('Report queued.');
    const { reply } = await send(`ADMIN ${currentCode()}`, repo);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-9', params: { all: true } }));
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'VERIFY', entityId: 'request-9' }), account.profileId);
    expect(reply.mock.calls[0][0]).toBe('Report queued.');
    expect(reply.mock.calls[1][0]).toContain('Admin tools: Ada Admin');
    run.mockRestore();
  });
});

describe('a role change or a disabled account ends access on the next message (#1292)', () => {
  it.each([
    ['account disabled', { ...account, approvalStatus: 'suspended' }, 'account_inactive'],
    ['moved to a resident role', { ...account, roleCategory: 'resident' }, 'role_not_allowed'],
    ['whatsapp_admin.query removed', { ...account, permissions: ['whatsapp_admin.resident_status'] }, 'missing_permission'],
  ])('%s', async (_label, changed, reason) => {
    const repo = liveSession({ loadAccount: vi.fn().mockResolvedValue(changed) });
    const { reply, setStep, handled } = await step(ADMIN_MENU_NODE, '1', repo);
    expect(handled).toBe(true);
    expect(repo.revokeBinding).toHaveBeenCalledWith('binding-1', reason, NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEACTIVATE' }), account.profileId);
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(/has ended/);
    expect(setStep).toHaveBeenCalledWith('main');
    expect(await createWhatsAppAdminTools(liveSession({ loadAccount: vi.fn().mockResolvedValue(changed) }), () => NOW).menuLabel(PHONE)).toBeNull();
  });
});

describe('the automatic link (#1292 item 6)', () => {
  it('with the code on, links only after a good code, then audits and emails', async () => {
    const repo = autoLinkRepository();
    const opened = await send('ADMIN', repo);
    expect(opened.reply).toHaveBeenCalledWith(ADMIN_CODE_PROMPT);
    expect(repo.createBinding).not.toHaveBeenCalled();

    const { reply } = await step(ADMIN_CODE_NODE, currentCode(), repo);
    expect(repo.createBinding).toHaveBeenCalledWith({
      profileId: account.profileId,
      phoneNumber: PHONE,
      fingerprint: accountFingerprint(account),
      totpStep: totpStepAt(NOW.getTime()),
      sessionExpiresAt: '2026-10-22T10:15:00.000Z',
      now: NOW,
    });
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', entityId: 'binding-auto' }), account.profileId);
    expect(repo.emailAdmin).toHaveBeenCalledWith(account, 'linked', PHONE);
    expect(reply.mock.calls[0][0]).toContain('Admin tools: Ada Admin');
  });

  it('a wrong code links nothing', async () => {
    const repo = autoLinkRepository();
    await step(ADMIN_CODE_NODE, wrongCode(), repo);
    expect(repo.createBinding).not.toHaveBeenCalled();
    expect(repo.recordWrongCode).toHaveBeenCalledWith(PHONE, NOW);
  });

  it('with the code off, links on first open', async () => {
    const repo = autoLinkRepository({ getCodeRequired: vi.fn().mockResolvedValue(false) });
    const { reply } = await send('ADMIN', repo);
    expect(repo.createBinding).toHaveBeenCalledWith(expect.objectContaining({ totpStep: null, sessionExpiresAt: null }));
    expect(repo.setSessionExpiry).toHaveBeenCalledWith('binding-auto', '2026-10-22T10:15:00.000Z', NOW);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE' }), account.profileId);
    expect(reply.mock.calls[0][0]).toContain('Admin tools: Ada Admin');
  });

  it('shows item 6 for the number before the link exists', async () => {
    expect(await createWhatsAppAdminTools(autoLinkRepository(), () => NOW).menuLabel(PHONE)).toBe('Admin tools (code needed)');
  });
});
