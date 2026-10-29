import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTOTPCode, totpStepAt } from '@/lib/auth/totp';

const mocks = vi.hoisted(() => ({
  loadReportableHouses: vi.fn(),
  countDebtReportHouses: vi.fn(),
  renderDebtStatusReport: vi.fn(),
  queueDebtReportEmail: vi.fn(),
}));

vi.mock('@/lib/whatsapp/debt-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp/debt-report')>()),
  loadReportableHouses: mocks.loadReportableHouses,
  countDebtReportHouses: mocks.countDebtReportHouses,
  renderDebtStatusReport: mocks.renderDebtStatusReport,
  queueDebtReportEmail: mocks.queueDebtReportEmail,
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import {
  accountFingerprint,
  handleWhatsAppAdminMessage,
  handleWhatsAppAdminStep,
  parseWhatsAppAdminCommand,
  ADMIN_CODE_NODE,
  ADMIN_ITEM_NODE,
  ADMIN_MENU_NODE,
  ADMIN_NOT_ALLOWED_REPLY,
  type WhatsAppAdminAccount,
  type WhatsAppAdminActionContext,
  type WhatsAppAdminBinding,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';
import { DEBT_REPORT_NO_EMAIL_REPLY, DEBT_REPORT_NO_HOUSES_REPLY, debtReportAction } from '@/lib/whatsapp/admin-debt-report';
import { DEBT_REPORT_FAILED_REPLY } from '@/lib/whatsapp/debt-report';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { OwesRepository } from '@/lib/whatsapp/admin-owes';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const NOW = new Date('2026-10-22T10:00:00Z');
const PHONE = '+2348000000001';

const account: WhatsAppAdminAccount = {
  profileId: 'admin-1',
  fullName: 'Ada Admin',
  email: 'ada@example.test',
  approvalStatus: 'active',
  roleId: 'role-fin',
  roleName: 'financial_officer',
  roleDisplayName: 'Financial Officer',
  roleCategory: 'exco',
  permissions: ['whatsapp_admin.query', 'whatsapp_admin.debt_report'],
  totpSecret: SECRET,
};
const binding: WhatsAppAdminBinding = {
  id: 'binding-1',
  profileId: account.profileId,
  phoneNumber: PHONE,
  boundAt: '2026-10-20T10:00:00Z',
  lastUsedAt: '2026-10-21T10:00:00Z',
  lastTotpStep: null,
  sessionExpiresAt: null,
  accountFingerprint: accountFingerprint(account),
  codeRequired: true,
};
/** The same binding inside a live admin session. */
const live: WhatsAppAdminBinding = { ...binding, sessionExpiresAt: '2026-10-22T10:10:00Z' };

const message = (text: string): WhatsAppInboundMessage => ({ id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1', type: 'text', text });

function repository(overrides: Partial<WhatsAppAdminRepository> = {}): WhatsAppAdminRepository {
  return {
    getLockedUntil: vi.fn().mockResolvedValue(null),
    recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }),
    clearWrongCodes: vi.fn().mockResolvedValue(undefined),
    findLinkCode: vi.fn().mockResolvedValue(null),
    activateBinding: vi.fn().mockResolvedValue(true),
    findActiveBinding: vi.fn().mockResolvedValue(binding),
    getCodeRequired: vi.fn().mockResolvedValue(true),
    findAutoLinkProfile: vi.fn().mockResolvedValue(null),
    createBinding: vi.fn().mockResolvedValue(null),
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

async function send(text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const command = parseWhatsAppAdminCommand(text)!;
  await handleWhatsAppAdminMessage(message(text), command, { repository: repo, reply, setStep: vi.fn(), now: () => NOW });
  return reply;
}

/** A reply to the admin step on screen (#1292). */
async function step(node: string, text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const setStep = vi.fn().mockResolvedValue(undefined);
  const handled = await handleWhatsAppAdminStep(message(text), node, { repository: repo, reply, setStep, now: () => NOW });
  return { reply, setStep, handled };
}

/** Item 2 of the Admin tools menu, inside a live session. */
const ask = (repo: WhatsAppAdminRepository) => step(ADMIN_MENU_NODE, '2', repo).then(({ reply }) => reply);
const inSession = (overrides: Partial<WhatsAppAdminRepository> = {}) => repository({ findActiveBinding: vi.fn().mockResolvedValue(live), ...overrides });

const streets = [
  { number: 1, id: 's-a', name: 'Alpha Street' },
  { number: 2, id: 's-b', name: 'Bravo Street' },
  { number: 3, id: 's-c', name: 'Charlie Street' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadReportableHouses.mockResolvedValue([
    { id: 'h1', houseCode: '1', streetId: 's-a', streetName: 'Alpha Street' },
    { id: 'h2', houseCode: '2', streetId: 's-a', streetName: 'Alpha Street' },
    { id: 'h3', houseCode: '1', streetId: 's-b', streetName: 'Bravo Street' },
  ]);
  mocks.countDebtReportHouses.mockResolvedValue({ houseCount: 3, scopeLabel: 'Whole estate' });
  mocks.queueDebtReportEmail.mockResolvedValue(undefined);
});

describe('Security debt status: asking', () => {
  it('lists the streets with numbers and ALL, and waits for the choice, not a code', async () => {
    const repo = inSession();
    const reply = await ask(repo);

    const text = reply.mock.calls[0][0] as string;
    expect(text).toContain('1. Alpha Street (2 houses)');
    expect(text).toContain('2. Bravo Street (1 houses)');
    expect(text).toContain('ALL. Whole estate (3 houses)');
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'debt:choose', status: 'pending' }));
    expect(mocks.renderDebtStatusReport).not.toHaveBeenCalled();
  });

  it('with no reportable houses says so and leaves no question waiting', async () => {
    mocks.loadReportableHouses.mockResolvedValue([]);
    const repo = inSession();
    const reply = await ask(repo);

    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${DEBT_REPORT_NO_HOUSES_REPLY}`));
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('refuses a role without whatsapp_admin.debt_report, even with finance view permissions (#1292)', async () => {
    const repo = inSession({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query', 'billing.view', 'reports.view_financial'] }) });
    const reply = await ask(repo);

    expect(reply.mock.calls[0][0]).toMatch(/^I didn't catch that/);
    expect(reply.mock.calls[0][0]).not.toContain('Security debt status');
    expect(repo.createRequest).not.toHaveBeenCalled();
  });
});

describe('Security debt status: choosing', () => {
  const waiting = { action: 'debt', state: { streets } };
  const choose = async (text: string, repo = inSession({ findPendingChoice: vi.fn().mockResolvedValue(waiting) })) => {
    const { reply, setStep, handled } = await step(ADMIN_ITEM_NODE, text, repo);
    return { repo, reply, setStep, handled };
  };

  it('ALL becomes a pending request for the whole estate and asks for a fresh code', async () => {
    const { repo, reply, setStep, handled } = await choose('ALL');
    expect(handled).toBe(true);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'debt', status: 'pending', params: { all: true, streetIds: [] } }));
    expect(reply.mock.calls[0][0]).toMatch(/send the 6-digit code/);
    expect(setStep).toHaveBeenCalledWith(ADMIN_CODE_NODE);
  });

  it('runs at once without a code when no code is needed (#1292)', async () => {
    const repo = inSession({ findPendingChoice: vi.fn().mockResolvedValue(waiting), getCodeRequired: vi.fn().mockResolvedValue(false) });
    const { reply } = await choose('ALL', repo);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'debt', status: 'done' }));
    expect(mocks.queueDebtReportEmail).toHaveBeenCalled();
    expect(reply.mock.calls[0][0]).toMatch(/on its way/);
  });

  it('numbers such as 2,3 become those streets', async () => {
    const { repo } = await choose('2,3');
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ params: { all: false, streetIds: ['s-b', 's-c'] } }));
  });

  it('a single number picks one street', async () => {
    const { repo } = await choose('1');
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ params: { all: false, streetIds: ['s-a'] } }));
  });

  it('a number outside the list keeps the question open', async () => {
    const { repo, reply, handled } = await choose('2,9');
    expect(handled).toBe(true);
    expect(reply.mock.calls[0][0]).toMatch(/no street 9/);
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('shows the menu again when the question ran out', async () => {
    const { reply, setStep, handled } = await choose('2', inSession());
    expect(handled).toBe(true);
    expect(reply.mock.calls[0][0]).toMatch(/ran out after 5 minutes/);
    expect(setStep).toHaveBeenCalledWith(ADMIN_MENU_NODE);
  });

  it('a failure after the choice was taken is not hidden as a resident message', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('send failed'));
    const repo = inSession({ findPendingChoice: vi.fn().mockResolvedValue(waiting) });
    await expect(handleWhatsAppAdminStep(message('2'), ADMIN_ITEM_NODE, { repository: repo, reply, setStep: vi.fn(), now: () => NOW })).rejects.toThrow('send failed');
    expect(repo.createRequest).toHaveBeenCalled();
  });

  it('leaves the message alone from a number that is not a linked admin', async () => {
    const { handled, reply } = await choose('2', repository({ findActiveBinding: vi.fn().mockResolvedValue(null) }));
    expect(handled).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('Security debt status: running with a fresh code', () => {
  const code = () => generateTOTPCode(SECRET, totpStepAt(NOW.getTime()));
  const params = { all: false, streetIds: ['s-a'] };
  const context = (overrides: Partial<WhatsAppAdminActionContext> = {}): WhatsAppAdminActionContext => ({
    account, binding, now: NOW, requestId: 'r', params, audit: vi.fn(), owes: {} as OwesRepository, ...overrides,
  });

  it('takes the code, queues the report without drawing it, replies with the count, and audits who asked for what', async () => {
    mocks.countDebtReportHouses.mockResolvedValue({ houseCount: 2, scopeLabel: 'Alpha Street' });
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'request-7', action: 'debt', params }) });
    const reply = await send(`ADMIN ${code()}`, repo);

    expect(mocks.countDebtReportHouses).toHaveBeenCalledWith(params);
    expect(mocks.renderDebtStatusReport).not.toHaveBeenCalled();
    expect(mocks.queueDebtReportEmail).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'admin-1', email: 'ada@example.test', phoneNumber: PHONE, scope: params }));
    expect(reply.mock.calls[0][0]).toBe('The debt status report for Alpha Street (2 houses) is on its way to ada@example.test.');
    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'request-7', metadata: expect.objectContaining({ action: 'debt', scope: ['s-a'], outcome: 'queued', house_count: 2 }) }),
      'admin-1'
    );
  });

  it('records ALL as the scope', async () => {
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'r', action: 'debt', params: { all: true, streetIds: [] } }) });
    await send(`ADMIN ${code()}`, repo);
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ scope: 'ALL' }) }), 'admin-1');
  });

  it('a scope with no houses left says so and queues nothing', async () => {
    mocks.countDebtReportHouses.mockResolvedValue({ houseCount: 0, scopeLabel: 'Alpha Street' });
    const result = await debtReportAction.run(context());
    expect(result).toMatchObject({ reply: DEBT_REPORT_NO_HOUSES_REPLY });
    expect(mocks.queueDebtReportEmail).not.toHaveBeenCalled();
  });

  it('a read failure gives the failure reply, queues nothing and sends no text version', async () => {
    mocks.countDebtReportHouses.mockRejectedValue(new Error('db down'));
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'r', action: 'debt', params }) });
    const reply = await send(`ADMIN ${code()}`, repo);

    // The answer, then the Admin tools menu as its own message.
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[0][0]).toBe(DEBT_REPORT_FAILED_REPLY);
    expect(mocks.queueDebtReportEmail).not.toHaveBeenCalled();
    expect(repo.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'read_failed' }) }), 'admin-1');
  });

  it('an admin without an account email gets that said and nothing is queued', async () => {
    const result = await debtReportAction.run(context({ account: { ...account, email: ' ' } }));
    expect(result).toMatchObject({ reply: DEBT_REPORT_NO_EMAIL_REPLY });
    expect(mocks.countDebtReportHouses).not.toHaveBeenCalled();
    expect(mocks.queueDebtReportEmail).not.toHaveBeenCalled();
  });

  it('a queue failure is reported, not hidden', async () => {
    mocks.queueDebtReportEmail.mockRejectedValue(new Error('queue down'));
    const result = await debtReportAction.run(context());
    expect(result).toMatchObject({ audit: expect.objectContaining({ outcome: 'queue_failed' }) });
  });

  it('the code typed alone on the code step runs it too (#1292)', async () => {
    const repo = repository({ takePendingRequest: vi.fn().mockResolvedValue({ id: 'r', action: 'debt', params }) });
    await step(ADMIN_CODE_NODE, code(), repo);
    expect(mocks.queueDebtReportEmail).toHaveBeenCalled();
  });

  it('refuses at code time when the role lost whatsapp_admin.debt_report since the request', async () => {
    const repo = repository({
      loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query', 'reports.view_financial'] }),
      takePendingRequest: vi.fn().mockResolvedValue({ id: 'r', action: 'debt', params }),
    });
    const reply = await send(`ADMIN ${code()}`, repo);
    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${ADMIN_NOT_ALLOWED_REPLY}`));
    expect(mocks.queueDebtReportEmail).not.toHaveBeenCalled();
  });
});

describe('a live session does not skip the code', () => {
  it('item 2 still begins with the street question inside a session', async () => {
    const repo = inSession();
    await ask(repo);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(mocks.renderDebtStatusReport).not.toHaveBeenCalled();
  });
});
