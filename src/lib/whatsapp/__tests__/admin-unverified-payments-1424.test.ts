import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  HouseCandidate,
  HouseMatch,
  UnverifiedAlert,
  UnverifiedPayment,
  UnverifiedPaymentsRepository,
} from '@/lib/whatsapp/admin-unverified-payments-db';
import type { AuditEntry } from '@/lib/audit/recorder';

const mocks = vi.hoisted(() => ({ repo: null as unknown as UnverifiedPaymentsRepository }));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/admin-unverified-payments-db', () => ({
  createUnverifiedPaymentsRepository: () => mocks.repo,
  WHATSAPP_ADMIN_CHANNEL: { channel: 'whatsapp_admin' },
}));

import {
  accountFingerprint,
  adminMenuText,
  handleWhatsAppAdminStep,
  ADMIN_ITEM_NODE,
  ADMIN_MENU_NODE,
  type WhatsAppAdminAccount,
  type WhatsAppAdminBinding,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';
import {
  aliasName,
  composeList,
  parseStatementLine,
  HOUSE_PROMPT,
  NOT_ESTATE_MONEY_REASON,
  NO_BANK_PROOF,
  NO_ITEMS_REPLY,
  STATEMENT_PROMPT,
  UNCHECKED_ALERT_REFUSAL,
} from '@/lib/whatsapp/admin-unverified-payments';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const NOW = new Date('2026-11-02T09:40:00Z');
const PHONE = '+2348000000001';
const FULL = [
  'whatsapp_admin.query',
  'whatsapp_admin.unverified_payments',
  'payments.verify',
  'payments.create',
  'email_imports.process',
  'imports.approve',
];

const account: WhatsAppAdminAccount = {
  profileId: 'chair-1',
  fullName: 'FEYIJIMI ADEWOLE',
  email: 'chair@example.test',
  approvalStatus: 'active',
  roleId: 'role-chair',
  roleName: 'chairman',
  roleDisplayName: 'Chairman',
  roleCategory: 'exco',
  permissions: FULL,
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', // secret-scan:allow (well-known test base32, not a real secret)
};
const live: WhatsAppAdminBinding = {
  id: 'binding-1',
  profileId: account.profileId,
  phoneNumber: PHONE,
  boundAt: '2026-10-20T10:00:00Z',
  lastUsedAt: '2026-11-01T10:00:00Z',
  lastTotpStep: null,
  sessionExpiresAt: '2026-11-02T22:59:59Z',
  accountFingerprint: accountFingerprint(account),
  codeRequired: true,
};

// ---------------------------------------------------------------------------
// The database double: the Stage items of 2 Nov 2026 from the mockup.

type StoredAlert = UnverifiedAlert & { status: string; skipReason?: string; paymentId?: string; residentId?: string };
type StoredPayment = UnverifiedPayment & { verified: boolean; verifiedBy?: string; emailTransactionId?: string };

let store: {
  alerts: StoredAlert[];
  payments: StoredPayment[];
  houses: HouseMatch[];
  /** The residents on houses a name search can find (#1433). */
  candidates: HouseCandidate[];
  searched: string[];
  aliases: { residentId: string; name: string }[];
  recorded: { alertId: string; houseId: string; residentId: string; profileId: string; verified: boolean }[];
  audits: { entry: AuditEntry; profileId: string }[];
  live: string[];
  limit: number | null;
  findHouse: string[];
  failRecord?: string;
  /** Throws from these repository writes; `afterWrite` means the row was written before the throw. */
  throws: Partial<Record<'recordPayment' | 'verifyPayment' | 'finishAlert' | 'saveAlias' | 'paymentForAlert', 'beforeWrite' | 'afterWrite'>>;
  /** claimAlert loses a race: another admin claimed the alert first. */
  claimLost?: boolean;
  /** verifyPayment finds the payment verified meanwhile and changes nothing. */
  verifyRefused?: boolean;
};

function maybeThrow(name: keyof typeof store.throws, when: 'beforeWrite' | 'afterWrite') {
  if (store.throws[name] === when) throw new Error(`${name} failed`);
}

let seq = 0;
const alert = (date: string, amount: number, description: string): StoredAlert => ({
  id: `alert-${++seq}`,
  amount,
  date,
  createdAt: `${date}T08:${String(seq).padStart(2, '0')}:00Z`,
  description,
  reference: null,
  emailImportId: 'import-1',
  transactionDate: `${date}T08:00:00Z`,
  senderVerified: true,
  status: 'queued_for_review',
});
const payment = (date: string, amount: number, houseCode: string, resident: string, notes: string | null = null): StoredPayment => ({
  id: `payment-${++seq}`,
  amount,
  date,
  createdAt: `${date}T07:${String(seq).padStart(2, '0')}:00Z`,
  houseCode,
  residentId: `resident-${houseCode}`,
  resident,
  notes,
  verified: false,
});

function fakeRepository(): UnverifiedPaymentsRepository {
  const waitingAlert = (id: string) => store.alerts.find((a) => a.id === id && a.status === 'queued_for_review') ?? null;
  const openPayment = (id: string) => store.payments.find((p) => p.id === id && !p.verified) ?? null;
  return {
    listAlerts: async () => store.alerts.filter((a) => a.status === 'queued_for_review'),
    listPayments: async () => store.payments.filter((p) => !p.verified),
    getAlert: async (id) => waitingAlert(id),
    getPayment: async (id) => openPayment(id),
    findPayerAlias: async (name) => (store.aliases.some((a) => a.name.toLowerCase() === name.toLowerCase()) ? 'KNOWN RESIDENT' : null),
    findHouse: async (code) => {
      store.findHouse.push(code);
      return store.houses.find((h) => h.code.toLowerCase() === code.toLowerCase()) ?? null;
    },
    searchHouses: async (text) => {
      store.searched.push(text);
      const words = text.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.join('').length < 2) return [];
      return store.candidates.filter(
        (c) =>
          words.every((w) => c.resident.toLowerCase().includes(w)) ||
          store.aliases.some((a) => a.residentId === c.residentId && a.name.toLowerCase().includes(text.toLowerCase()))
      );
    },
    livePermissions: async () => store.live,
    autoProcessLimit: async () => store.limit,
    claimAlert: async (id) => {
      const a = waitingAlert(id);
      if (!a || store.claimLost) return false;
      a.status = 'processed';
      return true;
    },
    releaseAlert: async (id) => {
      const a = store.alerts.find((x) => x.id === id)!;
      a.status = 'queued_for_review';
    },
    finishAlert: async (id, { paymentId, residentId }) => {
      maybeThrow('finishAlert', 'beforeWrite');
      const a = store.alerts.find((x) => x.id === id)!;
      Object.assign(a, { paymentId, residentId });
    },
    recordPayment: async (a, house, profileId, verified) => {
      maybeThrow('recordPayment', 'beforeWrite');
      if (store.failRecord) return { error: store.failRecord };
      store.recorded.push({ alertId: a.id, ...house, profileId, verified });
      maybeThrow('recordPayment', 'afterWrite');
      return { paymentId: `new-payment-${store.recorded.length}` };
    },
    paymentForAlert: async (alertId) => {
      maybeThrow('paymentForAlert', 'beforeWrite');
      const index = store.recorded.findIndex((p) => p.alertId === alertId);
      return index < 0 ? null : `new-payment-${index + 1}`;
    },
    saveAlias: async (residentId, name) => {
      maybeThrow('saveAlias', 'beforeWrite');
      if (store.aliases.some((a) => a.residentId === residentId && a.name === name)) return false;
      store.aliases.push({ residentId, name });
      return true;
    },
    skipAlert: async (id, reason) => {
      const a = waitingAlert(id);
      if (!a) return false;
      Object.assign(a, { status: 'skipped', skipReason: reason });
      return true;
    },
    verifyPayment: async (id, { profileId, notes, emailTransactionId }) => {
      maybeThrow('verifyPayment', 'beforeWrite');
      const p = openPayment(id);
      if (!p || store.verifyRefused) return false;
      Object.assign(p, { verified: true, verifiedBy: profileId, notes, emailTransactionId });
      maybeThrow('verifyPayment', 'afterWrite');
      return true;
    },
    audit: async (entry, profileId) => {
      store.audits.push({ entry, profileId });
    },
  };
}

beforeEach(() => {
  seq = 0;
  store = {
    payments: [
      payment('2026-10-23', 120000, 'OJO.K-16C', 'SUSAN ONOME BADIRU', 'Access Bank receipt sent by the owner\nSecond line'),
      payment('2026-10-24', 120000, 'IBB-23C', 'WILLIAMS AYEMERE UKOKOBILI'),
      payment('2026-10-26', 60000, 'GLB-19BF-2', 'ANOSIKE CHIOMA LILIAN'),
      payment('2026-10-29', 60000, 'OJO.K-16A', 'COVENANT ITAUMA'),
      payment('2026-10-29', 30000, 'KOA-10F-5', 'BONIFACE OBIJIAKU'),
    ],
    // Bank texts as they are on Stage (the first, second and last four), and in the same shape.
    alerts: [
      alert('2026-10-31', 60000, 'PA:UP044011261031112606000088/TOYIN RUTH OLAYINKA/'),
      alert('2026-10-31', 1000, 'CPWInward:100004261031110917175953609212/RAPHAEL W'),
      alert('2026-11-02', 65000, 'FIP:ZIB/HENRY/ Henry Itoki'),
      alert('2026-11-02', 60000, 'FIP:ZIB/PROMISE D/'),
      alert('2026-11-02', 65000, 'FIP:ZIB/GANIYAT I/'),
      alert('2026-11-02', 10000, 'FIP:ZIB/OLUBANKE/'),
      alert('2026-11-02', 130000, 'FIP:GTB/ATSEYINKU  ATITAN THEODORE/Atseyinku Theod'),
      alert('2026-11-02', 39000, 'FIP:WEM/MARTINS ABIMBOLA A/ALAT NIP TRANSFER FROM'),
      alert('2026-11-02', 100000, 'FIP:ZIB/LILIAN/ Estate dues November to August'),
    ],
    houses: [
      { houseId: 'house-ibb', code: 'IBB-3AF-4', residentId: 'resident-ibb', resident: 'CHIBUEZE NICHOLAS JAMES' },
      { houseId: 'house-empty', code: 'KOA-1', residentId: null, resident: null },
    ],
    candidates: [
      { houseId: 'house-koa', code: 'KOA-15F-2', residentId: 'resident-koa', resident: 'MARTINS AWONUSI', role: 'tenant' },
      { houseId: 'house-ojo22', code: 'OJO.K-22F-3', residentId: 'resident-ojo', resident: 'MARTINS ONYEKA NWAGIMEJE', role: 'tenant' },
      ...[11, 12, 13, 14, 15].flatMap((n) => [
        { houseId: `house-okon-${n}-1`, code: `OJO.K-${n}F-1`, residentId: 'resident-okon', resident: 'MR OKON', role: 'resident_landlord' },
        { houseId: `house-okon-${n}-2`, code: `OJO.K-${n}F-2`, residentId: 'resident-okon', resident: 'MR OKON', role: 'non_resident_landlord' },
      ]),
      { houseId: 'house-coresident', code: 'IBB-3AF-5', residentId: 'resident-co', resident: 'ADA CORESIDENT', role: 'co_resident' },
    ],
    searched: [],
    aliases: [],
    recorded: [],
    audits: [],
    live: FULL,
    limit: 500000,
    findHouse: [],
    throws: {},
  };
  mocks.repo = fakeRepository();
});

// ---------------------------------------------------------------------------
// The WhatsApp conversation

function repository(permissions: string[]): WhatsAppAdminRepository & { choice: { action: string; state: Record<string, unknown> } | null } {
  const self = {
    choice: null as { action: string; state: Record<string, unknown> } | null,
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
    loadAccount: vi.fn().mockResolvedValue({ ...account, permissions }),
    acceptCode: vi.fn().mockResolvedValue(true),
    touchBinding: vi.fn(),
    createRequest: vi.fn(async (input: { action: string; params: Record<string, unknown>; status: string }) => {
      if (input.status === 'pending' && input.action.endsWith(':choose')) self.choice = { action: input.action.slice(0, -':choose'.length), state: input.params };
      return 'admin-request-1';
    }),
    takePendingRequest: vi.fn().mockResolvedValue(null),
    findPendingChoice: vi.fn(async () => self.choice),
    getDailyCap: vi.fn().mockResolvedValue(50),
    countDoneSince: vi.fn().mockResolvedValue(0),
    audit: vi.fn(),
    emailAdmin: vi.fn(),
  };
  return self;
}

const message = (text: string): WhatsAppInboundMessage => ({ id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1', type: 'text', text });

function conversation(permissions: string[] = FULL, startNode: string = ADMIN_MENU_NODE) {
  const repo = repository(permissions);
  let node = startNode;
  return {
    repo,
    get node() {
      return node;
    },
    async send(text: string): Promise<string[]> {
      const replies: string[] = [];
      await handleWhatsAppAdminStep(message(text), node, {
        repository: repo,
        reply: async (t: string) => {
          replies.push(t);
        },
        setStep: async (n: string) => {
          node = n;
        },
        now: () => NOW,
      });
      return replies;
    },
  };
}

const PAGE_1 = `1. 🧾 ₦120,000, 23 Oct, OJO.K-16C SUSAN ONOME BADIRU
2. 🧾 ₦120,000, 24 Oct, IBB-23C WILLIAMS AYEMERE UKOKOBILI
3. 🧾 ₦60,000, 26 Oct, GLB-19BF-2 ANOSIKE CHIOMA LILIAN
4. 🧾 ₦60,000, 29 Oct, OJO.K-16A COVENANT ITAUMA
5. 🧾 ₦30,000, 29 Oct, KOA-10F-5 BONIFACE OBIJIAKU
6. 🏦 ₦60,000, 31 Oct, TOYIN RUTH OLAYINKA
7. 🏦 ₦1,000, 31 Oct, RAPHAEL W
8. 🏦 ₦65,000, 2 Nov, HENRY ITOKI
9. 🏦 ₦60,000, 2 Nov, PROMISE D`;

describe('Unverified payments in Admin tools (#1424)', () => {
  it('shows item 6 only with its permission and payments.verify, payments.create and email_imports.process', () => {
    expect(adminMenuText(account, live)).toContain('6. 🔎 Unverified payments');
    for (const missing of FULL.slice(1, 5)) {
      expect(adminMenuText({ ...account, permissions: FULL.filter((p) => p !== missing) }, live)).not.toContain('Unverified payments');
    }
  });

  it('refuses 6 from the menu without the item permission', async () => {
    const chat = conversation(FULL.filter((p) => p !== 'whatsapp_admin.unverified_payments'));
    const [reply] = await chat.send('6');
    expect(reply).toMatch(/^I didn't catch that\./);
    expect(chat.repo.createRequest).not.toHaveBeenCalled();
  });

  it('lists both kinds oldest first with the count, the total and the icon lines, 9 to a page', async () => {
    const chat = conversation();
    const [list] = await chat.send('6');
    expect(list).toBe(
      `Unverified payments: 14 items, ₦920,000.\n🧾 = recorded from a receipt, no bank proof.\n🏦 = bank alert, no resident.\n\n${PAGE_1}\n\nReply a number to see one. M for more. 0 for Admin tools.`
    );
    expect(chat.node).toBe(ADMIN_ITEM_NODE);
  });

  it('shows the next page on M, and says when there are no more', async () => {
    const chat = conversation();
    await chat.send('6');
    const [page2] = await chat.send('M');
    expect(page2).toBe(
      `10. 🏦 ₦65,000, 2 Nov, GANIYAT I\n11. 🏦 ₦10,000, 2 Nov, OLUBANKE\n12. 🏦 ₦130,000, 2 Nov, ATSEYINKU ATITAN THEODORE\n13. 🏦 ₦39,000, 2 Nov, MARTINS ABIMBOLA A\n14. 🏦 ₦100,000, 2 Nov, LILIAN\n\nReply a number to see one. 0 for Admin tools.`
    );
    expect(await chat.send('m')).toEqual(['There are no more items. Reply a number, or 0 for Admin tools.']);
    // A number from page 1 still works on page 2: the numbers do not change.
    expect((await chat.send('1'))[0]).toMatch(/^🧾 Payment 1: no bank proof yet/);
  });

  it('says so when nothing is unverified', async () => {
    store.alerts = [];
    store.payments = [];
    const chat = conversation();
    const [reply] = await chat.send('6');
    expect(reply).toMatch(new RegExp(`^${NO_ITEMS_REPLY}`));
    expect(chat.node).toBe(ADMIN_MENU_NODE);
  });

  it('gives a bank alert to a house: one verified payment, the alert processed, the payer name saved', async () => {
    const chat = conversation();
    await chat.send('6');
    expect(await chat.send('8')).toEqual([
      '🏦 Bank alert 8: no resident yet\nAmount: ₦65,000\nDate: 2 Nov 2026\nBank text: FIP:ZIB/HENRY/ Henry Itoki\nBank email checked: yes\nKnown payer name: no match\nPayments with the same amount: none\n\nReply 1 Give to a house, 2 Not estate money, 0 Back.',
    ]);
    expect(await chat.send('1')).toEqual([HOUSE_PROMPT]);
    expect(await chat.send('Ibb-3Af-4')).toEqual([
      'IBB-3AF-4: CHIBUEZE NICHOLAS JAMES.\nRecord ₦65,000 for this resident from the HENRY ITOKI alert?\n\nReply 1 Yes, 2 Yes but do not save the payer name, 0 Back.',
    ]);
    // The house code goes to the lookup as typed.
    expect(store.findHouse).toEqual(['Ibb-3Af-4']);

    expect(await chat.send('1')).toEqual([
      'Done. ₦65,000 is recorded for IBB-3AF-4, CHIBUEZE NICHOLAS JAMES.\nThe bank alert is the bank proof, so the payment is verified.\nThe wallet pays open bills first.\nHENRY ITOKI is saved as a payer name for IBB-3AF-4.',
      '13 items left. Reply a number, or 0 for Admin tools.',
    ]);
    expect(store.recorded).toEqual([{ alertId: 'alert-8', houseId: 'house-ibb', residentId: 'resident-ibb', profileId: 'chair-1', verified: true }]);
    expect(store.alerts[2]).toEqual(expect.objectContaining({ status: 'processed', paymentId: 'new-payment-1', residentId: 'resident-ibb' }));
    expect(store.aliases).toEqual([{ residentId: 'resident-ibb', name: 'HENRY ITOKI' }]);
    expect(store.audits).toEqual([
      {
        profileId: 'chair-1',
        entry: expect.objectContaining({ action: 'APPROVE', entityType: 'email_transactions', entityId: 'alert-8', newValues: expect.objectContaining({ payment_id: 'new-payment-1', saved_alias: true, verified: true }) }),
      },
    ]);
    expect(chat.repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'whatsapp_admin_requests', metadata: expect.objectContaining({ action: 'unverified_payments', op: 'give', outcome: 'recorded' }) }),
      'chair-1'
    );
    // The list stays open with the same numbers; the settled item is gone from it.
    expect(chat.node).toBe(ADMIN_ITEM_NODE);
    expect(await chat.send('8')).toEqual(['Item 8 is already settled. Reply another number, or 0 for Admin tools.']);
    expect((await chat.send('10'))[0]).toMatch(/^🏦 Bank alert 10: no resident yet/);
  });

  it('records an alert whose bank email did not pass the check unverified, and says there is no bank proof yet (#1428)', async () => {
    store.alerts[2].senderVerified = false;
    const chat = conversation();
    await chat.send('6');
    const [detail] = await chat.send('8');
    expect(detail).toContain('\nBank email checked: no\n');
    for (const text of ['1', 'IBB-3AF-4']) await chat.send(text);
    const [done, left] = await chat.send('1');
    expect(done).toBe(
      [
        'Done. ₦65,000 is recorded for IBB-3AF-4, CHIBUEZE NICHOLAS JAMES.',
        'No bank proof yet: the bank email did not pass the check. The payment stays in this list until a bank statement line or a checked alert proves it.',
        'The wallet pays open bills first.',
        'HENRY ITOKI is saved as a payer name for IBB-3AF-4.',
      ].join('\n')
    );
    expect(done).toContain(NO_BANK_PROOF);
    expect(done).not.toContain('is verified');
    expect(left).toBe('13 items left. Reply a number, or 0 for Admin tools.');
    expect(store.recorded).toEqual([{ alertId: 'alert-8', houseId: 'house-ibb', residentId: 'resident-ibb', profileId: 'chair-1', verified: false }]);
    expect(store.alerts[2].status).toBe('processed');
    expect(store.audits[0].entry.newValues).toEqual(expect.objectContaining({ payment_id: 'new-payment-1', verified: false }));
  });

  it('refuses to link a payment to an alert whose bank email did not pass the check (#1428)', async () => {
    store.alerts.push({ ...alert('2026-11-02', 120000, 'NIP/SUSAN BADIRU'), senderVerified: false });
    const chat = conversation();
    for (const text of ['6', '1', '2']) await chat.send(text);
    const [reply, left] = await chat.send('15');
    expect(reply).toBe(UNCHECKED_ALERT_REFUSAL);
    expect(reply).toBe('Not done: the bank email of this alert did not pass the check, so it is not bank proof. To verify the payment, pick it again and reply 1 Bank statement shows it.');
    expect(left).toBe('15 items left. Reply a number, or 0 for Admin tools.');
    expect(store.payments[0].verified).toBe(false);
    expect(store.alerts[9].status).toBe('queued_for_review');
    expect(store.audits).toEqual([]);
  });

  it('records but saves no payer name on 2', async () => {
    const chat = conversation();
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await chat.send(text);
    const [done] = await chat.send('2');
    expect(done).not.toContain('payer name');
    expect(store.recorded).toHaveLength(1);
    expect(store.aliases).toEqual([]);
  });

  it('puts the alert back in the queue when the payment cannot be recorded', async () => {
    store.failRecord = 'Duplicate Payment Detected: same amount and date';
    const chat = conversation();
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await chat.send(text);
    const [reply, left] = await chat.send('1');
    expect(reply).toBe('Not done: Duplicate Payment Detected: same amount and date');
    expect(left).toBe('14 items left. Reply a number, or 0 for Admin tools.');
    expect(store.alerts[2].status).toBe('queued_for_review');
  });

  it('asks again for an unknown house code or a house with no resident', async () => {
    const chat = conversation();
    for (const text of ['6', '8', '1']) await chat.send(text);
    expect(await chat.send('XYZ-1')).toEqual(['No house matches "XYZ-1". Send another name or code. 0 Back.']);
    expect(await chat.send('KOA-1')).toEqual(['KOA-1 has no tenant or landlord to record the payment for. Send another house code, or 0 Back.']);
  });

  it('shows a known payer name and the payments with the same amount', async () => {
    store.aliases = [{ residentId: 'r', name: 'Toyin Ruth Olayinka' }];
    const chat = conversation();
    await chat.send('6');
    const [detail] = await chat.send('6');
    expect(detail).toContain('Known payer name: matches KNOWN RESIDENT');
    expect(detail).toContain('Payments with the same amount: 3, 4');
  });

  it('marks an alert not estate money after a confirm', async () => {
    const chat = conversation();
    for (const text of ['6', '7']) await chat.send(text);
    expect(await chat.send('2')).toEqual([
      'Mark the ₦1,000 alert from RAPHAEL W as not estate money? It leaves this list and the review queue. The dashboard keeps a record.\n\nReply 1 Yes, 0 Back.',
    ]);
    expect(await chat.send('1')).toEqual([
      'Done. The ₦1,000 alert from RAPHAEL W is marked not estate money.',
      '13 items left. Reply a number, or 0 for Admin tools.',
    ]);
    expect(store.alerts[1]).toEqual(expect.objectContaining({ status: 'skipped', skipReason: NOT_ESTATE_MONEY_REASON }));
    expect(store.recorded).toEqual([]);
    expect(store.audits[0].entry).toEqual(expect.objectContaining({ action: 'REJECT', entityType: 'email_transactions', newValues: { skip_reason: 'Not estate money (WhatsApp admin)' } }));
  });

  it('verifies a payment from the bank statement, keeping the text as typed', async () => {
    const chat = conversation();
    await chat.send('6');
    expect(await chat.send('1')).toEqual([
      '🧾 Payment 1: no bank proof yet\nHouse: OJO.K-16C\nResident: SUSAN ONOME BADIRU\nAmount: ₦120,000, paid 23 Oct 2026\nSource: Access Bank receipt sent by the owner\nBank alerts with the same amount: none\n\nReply 1 Bank statement shows it, 2 Link a bank alert, 0 Back.',
    ]);
    expect(await chat.send('1')).toEqual([STATEMENT_PROMPT]);
    expect(await chat.send('yesterday')).toEqual([STATEMENT_PROMPT]);
    expect(await chat.send('23 Oct 2026 TRF FROM Susan Onome BADIRU')).toEqual([
      'Done. ₦120,000 for OJO.K-16C, SUSAN ONOME BADIRU, is now verified.\nBank proof saved: statement 23 Oct 2026, "TRF FROM Susan Onome BADIRU".',
      '13 items left. Reply a number, or 0 for Admin tools.',
    ]);
    expect(store.payments[0]).toEqual(
      expect.objectContaining({
        verified: true,
        verifiedBy: 'chair-1',
        notes: 'Access Bank receipt sent by the owner\nSecond line\n[Bank statement]: 23 Oct 2026 TRF FROM Susan Onome BADIRU',
      })
    );
    expect(store.audits[0].entry).toEqual(
      expect.objectContaining({ action: 'VERIFY', entityType: 'payment_records', entityId: 'payment-1', newValues: expect.objectContaining({ verification_type: 'bank_statement', statement_date: '2026-10-23' }) })
    );
  });

  it('links a payment to a bank alert with the same amount, recording no second payment', async () => {
    store.alerts.push(alert('2026-11-02', 120000, 'NIP/SUSAN BADIRU'));
    const chat = conversation();
    await chat.send('6');
    expect((await chat.send('1'))[0]).toContain('Bank alerts with the same amount: 15');
    expect(await chat.send('2')).toEqual([
      'Bank alerts with the same amount. Reply a number to link one to this payment:\n15. 🏦 ₦120,000, 2 Nov, SUSAN BADIRU\n\n0 Back.',
    ]);
    expect(await chat.send('9')).toEqual(['Reply the number of a bank alert above, or 0 Back.']);
    expect(await chat.send('15')).toEqual([
      'Done. ₦120,000 for OJO.K-16C, SUSAN ONOME BADIRU, is now verified.\nBank proof: the ₦120,000 alert from SUSAN BADIRU, 2 Nov 2026. No second payment is recorded.',
      '13 items left. Reply a number, or 0 for Admin tools.',
    ]);
    const linked = store.alerts[9];
    expect(store.payments[0]).toEqual(expect.objectContaining({ verified: true, emailTransactionId: linked.id }));
    expect(linked).toEqual(expect.objectContaining({ status: 'processed', paymentId: 'payment-1', residentId: 'resident-OJO.K-16C' }));
    expect(store.recorded).toEqual([]);
    expect(store.audits.map((a) => a.entry.action)).toEqual(['VERIFY', 'APPROVE']);
    // Both numbers are settled, so the alert is gone from page 2 as well.
    expect(await chat.send('15')).toEqual(['Item 15 is already settled. Reply another number, or 0 for Admin tools.']);
    expect((await chat.send('M'))[0]).not.toContain('15.');
  });

  it('says when no bank alert has the same amount', async () => {
    const chat = conversation();
    for (const text of ['6', '5']) await chat.send(text);
    expect(await chat.send('2')).toEqual(['No bank alert in the list has the same amount. Reply 1 Bank statement shows it, or 0 Back.']);
  });

  it('says a pick settled elsewhere is settled, and keeps the list', async () => {
    const chat = conversation();
    await chat.send('6');
    store.alerts[2].status = 'skipped';
    expect(await chat.send('8')).toEqual(['Item 8 is already settled. Reply another number, or 0 for Admin tools.']);
    expect((await chat.send('9'))[0]).toMatch(/^🏦 Bank alert 9:/);
  });

  it('says so when the item is settled elsewhere before the confirm', async () => {
    const chat = conversation();
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await chat.send(text);
    store.alerts[2].status = 'skipped';
    expect(await chat.send('1')).toEqual(['Item 8 is already settled.', '13 items left. Reply a number, or 0 for Admin tools.']);
    expect(store.recorded).toEqual([]);
  });

  it('goes back to the list on 0, and to Admin tools on 0 from the list', async () => {
    const chat = conversation();
    for (const text of ['6', '8']) await chat.send(text);
    expect(await chat.send('0')).toEqual([`${PAGE_1}\n\nReply a number to see one. M for more. 0 for Admin tools.`]);
    expect(chat.node).toBe(ADMIN_ITEM_NODE);
    const [menu] = await chat.send('0');
    expect(menu).toContain('🛠️ Admin tools');
    expect(chat.node).toBe(ADMIN_MENU_NODE);
  });

  it('refuses an alert over the auto-process limit without imports.approve, before and at the write', async () => {
    store.limit = 50000;
    const noApprove = FULL.filter((p) => p !== 'imports.approve');
    const chat = conversation(noApprove);
    for (const text of ['6', '8']) await chat.send(text);
    expect(await chat.send('1')).toEqual(['A bank alert over ₦50,000 needs the imports.approve permission to record. Reply 2 Not estate money, or 0 Back.']);

    // The session had the permission when the list opened; the live account no longer has it.
    store.live = noApprove;
    const allowed = conversation();
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await allowed.send(text);
    expect((await allowed.send('1'))[0]).toBe('Not done: A bank alert over ₦50,000 needs the imports.approve permission to record.');
    expect(store.recorded).toEqual([]);
    expect(store.alerts[2].status).toBe('queued_for_review');
  });

  it('records an alert under the limit without imports.approve', async () => {
    store.limit = 100000;
    store.live = FULL.filter((p) => p !== 'imports.approve');
    const chat = conversation(store.live);
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await chat.send(text);
    expect((await chat.send('1'))[0]).toMatch(/^Done\./);
    expect(store.recorded).toHaveLength(1);
  });

  it('checks the live account again before any write', async () => {
    const chat = conversation();
    for (const text of ['6', '1', '1']) await chat.send(text);
    store.live = FULL.filter((p) => p !== 'payments.verify');
    expect((await chat.send('23 Oct 2026 TRF FROM SUSAN'))[0]).toBe('Not done: this needs the payments.verify permission.');
    expect(store.payments[0].verified).toBe(false);
    expect(store.audits).toEqual([]);
  });
});

describe('Unverified payments when a write fails (#1424)', () => {
  const LEFT_14 = '14 items left. Reply a number, or 0 for Admin tools.';
  const HENRY = () => store.alerts[2];

  async function giveHenry(chat = conversation()) {
    for (const text of ['6', '8', '1', 'IBB-3AF-4']) await chat.send(text);
    return chat.send('1');
  }

  /** Payment 1 (₦120,000) and a waiting ₦120,000 alert, number 15; the reply to picking it. */
  async function linkSusan(chat = conversation(), before?: () => void) {
    store.alerts.push(alert('2026-11-02', 120000, 'FIP:ZIB/SUSAN BADIRU/'));
    for (const text of ['6', '1', '2']) await chat.send(text);
    before?.();
    return chat.send('15');
  }
  const susanAlert = () => store.alerts[9];

  it('records nothing when another admin claimed the alert first', async () => {
    store.claimLost = true;
    expect(await giveHenry()).toEqual(['Item 8 is already settled.', LEFT_14]);
    expect(store.recorded).toEqual([]);
  });

  it('puts the alert back when recording throws before a payment is written', async () => {
    store.throws.recordPayment = 'beforeWrite';
    expect(await giveHenry()).toEqual(['Not done: recordPayment failed. The alert is back in the list.', LEFT_14]);
    expect(HENRY().status).toBe('queued_for_review');
    expect(store.audits).toEqual([]);
  });

  it('keeps the alert and finishes it when recording throws after the payment is written', async () => {
    store.throws.recordPayment = 'afterWrite';
    const [done] = await giveHenry();
    expect(done).toMatch(/^Done\. ₦65,000 is recorded for IBB-3AF-4/);
    expect(HENRY()).toEqual(expect.objectContaining({ status: 'processed', paymentId: 'new-payment-1' }));
    expect(store.audits.map((a) => a.entry.action)).toEqual(['APPROVE']);
  });

  it('leaves the alert claimed when it cannot tell whether a payment was written', async () => {
    store.throws.recordPayment = 'beforeWrite';
    store.throws.paymentForAlert = 'beforeWrite';
    const [reply] = await giveHenry();
    expect(reply).toBe('Not done: recordPayment failed. Check the review queue on the dashboard before you try again.');
    expect(HENRY().status).toBe('processed');
  });

  it('reports the payment as recorded, and audits it, when marking the alert fails', async () => {
    store.throws.finishAlert = 'beforeWrite';
    const [done] = await giveHenry();
    expect(done).toContain('Done. ₦65,000 is recorded for IBB-3AF-4, CHIBUEZE NICHOLAS JAMES.');
    expect(done).toContain('The alert could not be marked with the payment. Check the review queue on the dashboard.');
    expect(store.recorded).toHaveLength(1);
    expect(store.audits[0].entry).toEqual(expect.objectContaining({ action: 'APPROVE', newValues: expect.objectContaining({ payment_id: 'new-payment-1' }) }));
  });

  it('reports the payment as recorded, and audits it, when saving the payer name fails', async () => {
    store.throws.saveAlias = 'beforeWrite';
    const [done] = await giveHenry();
    expect(done).toMatch(/^Done\./);
    expect(done).toContain('The payer name HENRY ITOKI could not be saved.');
    expect(done).not.toContain('is saved as a payer name');
    expect(store.audits[0].entry.newValues).toEqual(expect.objectContaining({ saved_alias: false }));
  });

  it('puts the alert back when the payment was verified meanwhile', async () => {
    store.verifyRefused = true;
    expect(await linkSusan()).toEqual(['Item 1 is already settled.', '15 items left. Reply a number, or 0 for Admin tools.']);
    expect(susanAlert().status).toBe('queued_for_review');
  });

  it('puts the alert back when verifying throws and the payment is still unverified', async () => {
    store.throws.verifyPayment = 'beforeWrite';
    const [reply] = await linkSusan();
    expect(reply).toBe('Not done: verifyPayment failed. The alert is back in the list.');
    expect(susanAlert().status).toBe('queued_for_review');
    expect(store.payments[0].verified).toBe(false);
  });

  it('finishes the link when verifying throws after the payment is verified', async () => {
    store.throws.verifyPayment = 'afterWrite';
    const [done] = await linkSusan();
    expect(done).toMatch(/^Done\. ₦120,000 for OJO\.K-16C/);
    expect(susanAlert()).toEqual(expect.objectContaining({ status: 'processed', paymentId: 'payment-1' }));
  });

  it('refuses a link when the amounts differ at the write', async () => {
    const [reply] = await linkSusan(conversation(), () => {
      susanAlert().amount = 125000;
    });
    expect(reply).toBe('Not done: the bank alert and the payment have different amounts.');
    expect(store.payments[0].verified).toBe(false);
    expect(susanAlert().status).toBe('queued_for_review');
  });

  it('refuses a link to an alert over the limit when the live account lacks imports.approve', async () => {
    store.limit = 50000;
    store.live = FULL.filter((p) => p !== 'imports.approve');
    const [reply] = await linkSusan();
    expect(reply).toBe('Not done: A bank alert over ₦50,000 needs the imports.approve permission to record.');
    expect(store.payments[0].verified).toBe(false);
    expect(susanAlert().status).toBe('queued_for_review');
  });

  it('links an alert over the limit for a live super admin', async () => {
    store.limit = 50000;
    store.live = FULL.filter((p) => p !== 'imports.approve');
    const chat = conversation(FULL);
    chat.repo.loadAccount = vi.fn().mockResolvedValue({ ...account, roleName: 'super_admin' });
    expect((await linkSusan(chat))[0]).toMatch(/^Done\./);
  });
});

describe('0 in the other Admin tools items (#1424)', () => {
  it.each([
    ['approve_payment', { reports: [{ number: 1, id: 'req-1' }] }],
    ['approve_payment', { requestId: 'req-1' }],
    ['owes', {}],
    ['debt', { streets: [] }],
  ])('still goes back to Admin tools from %s', async (action, state) => {
    const chat = conversation(FULL, ADMIN_ITEM_NODE);
    chat.repo.choice = { action, state };
    const [menu] = await chat.send('0');
    expect(menu).toContain('🛠️ Admin tools');
    expect(chat.node).toBe(ADMIN_MENU_NODE);
  });
});

describe('composeList (#1424)', () => {
  it('merges oldest first and shows the year for a day in another year', () => {
    seq = 0;
    // Created in the opposite order to their dates: the date decides.
    const { entries } = composeList(
      [{ ...alert('2026-10-01', 5000.5, 'NIP/ADA OBI'), createdAt: '2026-10-05T00:00:00Z' }],
      [
        { ...payment('2025-12-30', 2000, 'A-1', 'BOLA ADE'), createdAt: '2026-10-06T00:00:00Z' },
        { ...payment('2026-10-02', 3000, 'B-2', 'CHI EZE'), createdAt: '2026-10-04T00:00:00Z' },
      ],
      NOW
    );
    expect(entries.map((e) => e.line)).toEqual([
      '1. 🧾 ₦2,000, 30 Dec 2025, A-1 BOLA ADE',
      '2. 🏦 ₦5,000.50, 1 Oct, ADA OBI',
      '3. 🧾 ₦3,000, 2 Oct, B-2 CHI EZE',
    ]);
  });
});

describe('parseStatementLine (#1424)', () => {
  it('reads the date and keeps the text as typed', () => {
    expect(parseStatementLine('23 Oct 2026 TRF FROM Susan')).toEqual({ day: '2026-10-23', text: 'TRF FROM Susan' });
    expect(parseStatementLine('3 November 2026, NIP/Ada Obi')).toEqual({ day: '2026-11-03', text: 'NIP/Ada Obi' });
  });

  it('refuses a line with no date, no text or an impossible day', () => {
    expect(parseStatementLine('TRF FROM Susan')).toBeNull();
    expect(parseStatementLine('23 Oct 2026')).toBeNull();
    expect(parseStatementLine('31 Feb 2026 TRF')).toBeNull();
    expect(parseStatementLine('12 Foo 2026 TRF')).toBeNull();
  });
});

describe('payer names from Stage bank alert texts (#1424)', () => {
  it.each([
    ['PA:UP044011261031112606000088/TOYIN RUTH OLAYINKA/', 'TOYIN RUTH OLAYINKA'],
    ['CPWInward:100004261031110917175953609212/RAPHAEL W', 'RAPHAEL W'],
    ['FIP:ZIB/HENRY/ Henry Itoki', 'HENRY ITOKI'],
    ['FIP:GTB/ATSEYINKU  ATITAN THEODORE/Atseyinku Theod', 'ATSEYINKU ATITAN THEODORE'],
    ['FIP:WEM/MARTINS ABIMBOLA A/ALAT NIP TRANSFER FROM', 'MARTINS ABIMBOLA A'],
    ['FIP:ZIB/LILIAN/ Estate dues November to August', 'LILIAN'],
    // #1433
    ['FBNMOBILE:ISIMAH NKECHI RACHEAL/For 2 months Tuke', 'ISIMAH NKECHI RACHEAL'],
    ['ISW:MMB/LUKA BROTHERS T/for estate security levy/A', 'LUKA BROTHERS T'],
    ['NIP:FCMB/JOHN DOE/dues', 'JOHN DOE'],
    ['TRF:OPAY/AMAKA OBI', 'AMAKA OBI'],
  ])('%s', (description, alias) => {
    expect(aliasName(description)).toBe(alias);
  });
});

describe('Give to a house by code or name (#1433)', () => {
  /** Opens alert 13 (the MARTINS ABIMBOLA A alert) and replies 1 Give to a house. */
  async function atHouseQuestion() {
    const chat = conversation();
    for (const text of ['6', '13']) await chat.send(text);
    expect(await chat.send('1')).toEqual([HOUSE_PROMPT]);
    expect(HOUSE_PROMPT).toBe("Send the house code or part of the resident's name.\nExamples: IBB-3AF-4 or MARTINS");
    return chat;
  }

  it('goes on as before for a house code, without a name search', async () => {
    const chat = await atHouseQuestion();
    const [confirm] = await chat.send('ibb-3af-4');
    expect(confirm).toMatch(/^IBB-3AF-4: CHIBUEZE NICHOLAS JAMES\./);
    expect(store.searched).toEqual([]);
  });

  it('lists the houses that match a name, then confirms the resident on the picked line', async () => {
    const chat = await atHouseQuestion();
    expect(await chat.send('martins')).toEqual([
      '2 houses match "MARTINS":\n1. KOA-15F-2 MARTINS AWONUSI, tenant\n2. OJO.K-22F-3 MARTINS ONYEKA NWAGIMEJE, tenant\n\nReply a number, or send another name or code. 0 Back.',
    ]);
    // Not the resident of line 1: the picked line is used.
    expect(await chat.send('2')).toEqual([
      'OJO.K-22F-3: MARTINS ONYEKA NWAGIMEJE.\nRecord ₦39,000 for this resident from the MARTINS ABIMBOLA A alert?\n\nReply 1 Yes, 2 Yes but do not save the payer name, 0 Back.',
    ]);
    await chat.send('2');
    expect(store.recorded).toEqual([{ alertId: 'alert-13', houseId: 'house-ojo22', residentId: 'resident-ojo', profileId: 'chair-1', verified: true }]);
    expect(store.aliases).toEqual([]);
  });

  it('says so for one match, and for none, in the same step', async () => {
    const chat = await atHouseQuestion();
    expect((await chat.send('awonusi'))[0]).toMatch(/^1 house matches "AWONUSI":\n1\. KOA-15F-2 MARTINS AWONUSI, tenant\n/);
    expect(await chat.send('zzzz')).toEqual(['No house matches "ZZZZ". Send another name or code. 0 Back.']);
    // The old list is gone: a number is a new search now.
    expect(await chat.send('1')).toEqual(['No house matches "1". Send another name or code. 0 Back.']);
    expect(store.searched).toEqual(['awonusi', 'zzzz', '1']);
  });

  it('shows one line per house for a person with many houses, with landlord and co-resident words', async () => {
    const chat = await atHouseQuestion();
    const [list] = await chat.send('okon');
    expect(list.split('\n').slice(0, 3)).toEqual(['10 houses match "OKON":', '1. OJO.K-11F-1 MR OKON, landlord', '2. OJO.K-11F-2 MR OKON, landlord']);
    expect((await chat.send('coresident'))[0]).toContain('1. IBB-3AF-5 ADA CORESIDENT, co-resident');
  });

  it('pages nine to a page: M shows the rest, numbers go on, a pick works on page 2', async () => {
    const chat = await atHouseQuestion();
    const [page1] = await chat.send('okon');
    expect(page1.split('\n')).toHaveLength(1 + 9 + 1 + 1);
    expect(page1.endsWith('Reply a number, or send another name or code. M for more. 0 Back.')).toBe(true);
    const [page2] = await chat.send('m');
    expect(page2).toBe('10 houses match "OKON":\n10. OJO.K-15F-2 MR OKON, landlord\n\nReply a number, or send another name or code. 0 Back.');
    expect(await chat.send('M')).toEqual(['There are no more houses. Reply a number, or send another name or code. 0 Back.']);
    expect((await chat.send('10'))[0]).toMatch(/^OJO\.K-15F-2: MR OKON\./);
  });

  it('matches a saved payer name', async () => {
    store.aliases = [{ residentId: 'resident-koa', name: 'MARTINS ABIMBOLA A' }];
    const chat = await atHouseQuestion();
    expect((await chat.send('abimbola'))[0]).toBe(
      '1 house matches "ABIMBOLA":\n1. KOA-15F-2 MARTINS AWONUSI, tenant\n\nReply a number, or send another name or code. 0 Back.'
    );
  });

  it('replaces the list with the new text, and a number then picks from the new list', async () => {
    const chat = await atHouseQuestion();
    await chat.send('martins');
    await chat.send('okon');
    expect((await chat.send('1'))[0]).toMatch(/^OJO\.K-11F-1: MR OKON\./);
  });

  it('0 goes back to the alert detail, from the question and from a list', async () => {
    const detail = '🏦 Bank alert 13: no resident yet\nAmount: ₦39,000\nDate: 2 Nov 2026\nBank text: FIP:WEM/MARTINS ABIMBOLA A/ALAT NIP TRANSFER FROM\nBank email checked: yes\nKnown payer name: no match\nPayments with the same amount: none\n\nReply 1 Give to a house, 2 Not estate money, 0 Back.';
    const chat = await atHouseQuestion();
    expect(await chat.send('0')).toEqual([detail]);
    await chat.send('1');
    await chat.send('martins');
    expect(await chat.send('0')).toEqual([detail]);
    // From the alert detail, 1 asks again.
    expect(await chat.send('1')).toEqual([HOUSE_PROMPT]);
  });

  it('passes the text to the search as typed, for the database to escape', async () => {
    const chat = await atHouseQuestion();
    await chat.send('50%_off');
    expect(store.searched).toEqual(['50%_off']);
  });
});
