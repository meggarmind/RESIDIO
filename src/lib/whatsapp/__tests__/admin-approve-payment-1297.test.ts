import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decideAsServiceAccount: vi.fn(),
  sendEmail: vi.fn(),
  tables: {} as Record<string, unknown>,
}));

vi.mock('@/lib/approvals/decision', () => ({ decideAsServiceAccount: mocks.decideAsServiceAccount }));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));

/** Chainable query double per table: every builder returns itself; awaiting or maybeSingle() gives the table's result. */
function query(result: unknown) {
  const promise = Promise.resolve(result);
  const q: Record<string, unknown> = { then: promise.then.bind(promise) };
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) q[m] = vi.fn().mockReturnValue(q);
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  return q;
}
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: (table: string) => query(mocks.tables[table] ?? { data: null, error: null }) }),
}));

import {
  accountFingerprint,
  adminMenuText,
  handleWhatsAppAdminStep,
  ADMIN_ITEM_NODE,
  ADMIN_MENU_NODE,
  type WhatsAppAdminAccount,
  type WhatsAppAdminActionContext,
  type WhatsAppAdminBinding,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';
import { approvePaymentAction, DECIDE_PROMPT, NO_REPORTS_REPLY, REPORT_GONE_REPLY } from '@/lib/whatsapp/admin-approve-payment';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { OwesRepository } from '@/lib/whatsapp/admin-owes';

const NOW = new Date('2026-10-29T10:00:00Z');
const PHONE = '+2348000000001';
const ITEM = ['whatsapp_admin.query', 'whatsapp_admin.approve_payment', 'approvals.approve_reject', 'payments.verify'];

const account: WhatsAppAdminAccount = {
  profileId: 'fo-1',
  fullName: 'Femi Officer',
  email: 'fo@example.test',
  approvalStatus: 'active',
  roleId: 'role-fo',
  roleName: 'financial_officer',
  roleDisplayName: 'Financial Officer',
  roleCategory: 'exco',
  permissions: ITEM,
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', // secret-scan:allow (well-known test base32, not a real secret)
};
const live: WhatsAppAdminBinding = {
  id: 'binding-1',
  profileId: account.profileId,
  phoneNumber: PHONE,
  boundAt: '2026-10-20T10:00:00Z',
  lastUsedAt: '2026-10-28T10:00:00Z',
  lastTotpStep: null,
  sessionExpiresAt: '2026-10-29T10:10:00Z',
  accountFingerprint: accountFingerprint(account),
  codeRequired: true,
};

const pendingRequest = {
  id: 'req-1',
  entity_id: 'payment-1',
  requested_changes: { amount: 50000, payment_date: '2026-10-12', property: '12 Palm Close', reference: 'GTB TRF 98765' },
  created_at: '2026-10-28T09:00:00Z',
};

function repository(overrides: Partial<WhatsAppAdminRepository> = {}): WhatsAppAdminRepository {
  return {
    getLockedUntil: vi.fn().mockResolvedValue(null),
    recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }),
    clearWrongCodes: vi.fn(),
    findLinkCode: vi.fn().mockResolvedValue(null),
    activateBinding: vi.fn().mockResolvedValue(true),
    findActiveBinding: vi.fn().mockResolvedValue(live),
    getCodeRequired: vi.fn().mockResolvedValue(true),
    findAutoLinkProfile: vi.fn().mockResolvedValue(null),
    createBinding: vi.fn().mockResolvedValue(null),
    setSessionExpiry: vi.fn(),
    revokeBinding: vi.fn(),
    loadAccount: vi.fn().mockResolvedValue(account),
    acceptCode: vi.fn().mockResolvedValue(true),
    touchBinding: vi.fn(),
    createRequest: vi.fn().mockResolvedValue('admin-request-1'),
    takePendingRequest: vi.fn().mockResolvedValue(null),
    findPendingChoice: vi.fn().mockResolvedValue(null),
    getDailyCap: vi.fn().mockResolvedValue(50),
    countDoneSince: vi.fn().mockResolvedValue(0),
    audit: vi.fn(),
    emailAdmin: vi.fn(),
    ...overrides,
  };
}

const message = (text: string): WhatsAppInboundMessage => ({ id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1', type: 'text', text });

async function step(node: string, text: string, repo: WhatsAppAdminRepository) {
  const reply = vi.fn();
  const setStep = vi.fn();
  await handleWhatsAppAdminStep(message(text), node, { repository: repo, reply, setStep, now: () => NOW });
  return { reply, setStep };
}

const context = (overrides: Partial<WhatsAppAdminActionContext> = {}): WhatsAppAdminActionContext => ({
  account,
  binding: live,
  now: NOW,
  codeNeeded: true,
  requestId: 'admin-request-1',
  params: { requestId: 'req-1', decision: 'approve' },
  audit: vi.fn(),
  owes: {} as OwesRepository,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = {
    approval_requests: { data: [pendingRequest], error: null },
    payment_records: { data: { resident: { first_name: 'Ada', last_name: 'Resident' } }, error: null },
    profiles: { data: [{ full_name: 'Femi Officer', email: 'fo@example.test' }, { full_name: 'Chi Chairman', email: 'chair@example.test' }], error: null },
  };
  mocks.decideAsServiceAccount.mockResolvedValue({ success: true, error: null });
  mocks.sendEmail.mockResolvedValue({ success: true });
});

describe('Approve payment report in Admin tools (#1297)', () => {
  it('shows the item only with whatsapp_admin.approve_payment, approvals.approve_reject and payments.verify', () => {
    expect(adminMenuText(account, live)).toContain('5. Approve payment report');
    for (const missing of ITEM.slice(1)) {
      expect(adminMenuText({ ...account, permissions: ITEM.filter((p) => p !== missing) }, live)).not.toContain('Approve payment report');
    }
  });

  it('refuses the item from the menu without payments.verify', async () => {
    const repo = repository({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ITEM.filter((p) => p !== 'payments.verify') }) });
    const { reply } = await step(ADMIN_MENU_NODE, '5', repo);
    expect(reply.mock.calls[0][0]).toMatch(/^I didn't catch that\./);
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('lists the reports waiting, then shows one with the reference masked and asks 1 Approve, 2 Reject, 0 Back', async () => {
    const list = await step(ADMIN_MENU_NODE, '5', repository());
    expect(list.reply).toHaveBeenCalledWith(expect.stringContaining('1. ₦50,000.00, 12 Palm Close, reported 28 Oct 2026'));
    expect(list.setStep).toHaveBeenCalledWith(ADMIN_ITEM_NODE);

    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    const repo = repository({ findPendingChoice: vi.fn().mockResolvedValue({ action: 'approve_payment', state: { reports: [{ number: 1, id: 'req-1' }] } }) });
    const { reply } = await step(ADMIN_ITEM_NODE, '1', repo);
    const shown = reply.mock.calls[0][0] as string;
    expect(shown).toContain('Resident: Ada Resident');
    expect(shown).toContain('House: 12 Palm Close');
    expect(shown).toContain('Amount: ₦50,000.00');
    expect(shown).toContain('Payment date: 12 Oct 2026');
    expect(shown).toContain('Reference: ref ••••8765');
    expect(shown).not.toContain('GTB TRF 98765');
    expect(shown).toContain('Reported: 28 Oct 2026');
    expect(shown).toContain(DECIDE_PROMPT);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve_payment:choose', params: { requestId: 'req-1' } }));
  });

  it('says so when nothing is waiting', async () => {
    mocks.tables.approval_requests = { data: [], error: null };
    const { reply } = await step(ADMIN_MENU_NODE, '5', repository());
    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${NO_REPORTS_REPLY}`));
  });

  it('turns 1 and 2 into approve and reject, and nothing else', async () => {
    const state = { requestId: 'req-1' };
    expect(await approvePaymentAction.choose!('1', state)).toEqual({ params: { requestId: 'req-1', decision: 'approve' } });
    expect(await approvePaymentAction.choose!('2', state)).toEqual({ params: { requestId: 'req-1', decision: 'reject' } });
    expect(await approvePaymentAction.choose!('3', state)).toEqual({ retry: DECIDE_PROMPT });
  });

  it('decides through the shared service path as the admin, marked whatsapp_admin', async () => {
    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    const result = await approvePaymentAction.run(context());
    expect(mocks.decideAsServiceAccount).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'fo-1',
      requestId: 'req-1',
      decision: 'approve',
      requestType: 'whatsapp_payment_report',
      alsoRequires: ['whatsapp_admin.approve_payment', 'payments.verify'],
      metadata: expect.objectContaining({ channel: 'whatsapp_admin' }),
    }));
    expect(result).toEqual(expect.objectContaining({ reply: 'Approved: ₦50,000.00 for 12 Palm Close. The payment is verified and the wallet is credited.' }));
  });

  it('passes a refusal on, such as the own-request rule', async () => {
    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    mocks.decideAsServiceAccount.mockResolvedValue({ success: false, error: 'You cannot approve your own request' });
    const result = await approvePaymentAction.run(context({ codeNeeded: false }));
    expect(result).toEqual(expect.objectContaining({ reply: 'Not done: You cannot approve your own request' }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses a report no longer pending without deciding', async () => {
    mocks.tables.approval_requests = { data: null, error: null };
    const result = await approvePaymentAction.run(context());
    expect(result).toEqual(expect.objectContaining({ reply: REPORT_GONE_REPLY }));
    expect(mocks.decideAsServiceAccount).not.toHaveBeenCalled();
  });

  it('emails the Financial Officer and the Chairman when the session opened without a code', async () => {
    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    await approvePaymentAction.run(context({ codeNeeded: false }));
    expect(mocks.sendEmail.mock.calls.map(([email]) => email.to.email)).toEqual(['fo@example.test', 'chair@example.test']);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ metadata: { purpose: 'whatsapp_payment_approval_alert', approval_request_id: 'req-1' } }));
  });

  it('sends no email when the code was needed, or for a rejection', async () => {
    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    await approvePaymentAction.run(context({ codeNeeded: true }));
    await approvePaymentAction.run(context({ codeNeeded: false, params: { requestId: 'req-1', decision: 'reject' } }));
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('still answers when the alert email fails', async () => {
    mocks.tables.approval_requests = { data: pendingRequest, error: null };
    mocks.sendEmail.mockRejectedValue(new Error('smtp down'));
    const result = await approvePaymentAction.run(context({ codeNeeded: false }));
    expect(result).toEqual(expect.objectContaining({ reply: expect.stringMatching(/^Approved:/) }));
  });
});
