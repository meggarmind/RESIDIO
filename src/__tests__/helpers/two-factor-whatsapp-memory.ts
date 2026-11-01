import { vi } from 'vitest';
import type {
  TwoFactorWhatsAppDeps,
  TwoFactorWhatsAppRepository,
  WhatsAppApprovalAccount,
  WhatsAppApprovalRequest,
} from '@/lib/auth/two-factor-whatsapp';
import { WHATSAPP_APPROVAL_TTL_MS } from '@/lib/auth/two-factor-whatsapp';

/** In-memory stand-in for the Supabase repository and the WhatsApp sends (#1389 tests). */
export function createMemoryTwoFactorWhatsApp(start = new Date('2026-11-01T09:00:00Z')) {
  let now = start;
  let nextId = 1;
  const accounts = new Map<string, WhatsAppApprovalAccount>();
  const requests: (WhatsAppApprovalRequest & { pollMessageKey: string | null; decidedVia: string | null })[] = [];
  const events: { profileId: string; event: string; metadata: Record<string, unknown> }[] = [];

  const repository: TwoFactorWhatsAppRepository = {
    async loadAccount(profileId) {
      return accounts.get(profileId) ?? null;
    },
    async findProfileByPhone(phone) {
      const digits = phone.replace(/\D/g, '');
      for (const account of accounts.values()) {
        if (account.phoneNumber && account.phoneNumber.replace(/\D/g, '') === digits) return account.profileId;
      }
      return null;
    },
    async countRequestsSince(profileId, since) {
      return requests.filter((r) => r.profileId === profileId && Date.parse(r.createdAt) >= since.getTime()).length;
    },
    async supersedePending(profileId) {
      for (const r of requests) if (r.profileId === profileId && r.status === 'pending') r.status = 'superseded';
    },
    async insertRequest(input) {
      if (requests.some((r) => r.profileId === input.profileId && r.status === 'pending')) {
        throw Object.assign(new Error('duplicate pending'), { code: '23505' });
      }
      const row = {
        id: `req-${nextId++}`,
        profileId: input.profileId,
        sessionId: input.sessionId,
        matchCode: input.matchCode,
        decoyCodes: input.decoyCodes,
        pollMessageId: null,
        pollMessageKey: null,
        decidedVia: null,
        status: 'pending' as const,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + WHATSAPP_APPROVAL_TTL_MS).toISOString(),
        markerIssuedAt: null,
      };
      requests.push(row);
      return { ...row };
    },
    async setPollMessage(id, messageId, key) {
      const r = requests.find((x) => x.id === id)!;
      r.pollMessageId = messageId;
      r.pollMessageKey = key;
    },
    async findPendingForProfile(profileId, since) {
      return requests.filter((r) => r.profileId === profileId && r.status === 'pending' && Date.parse(r.createdAt) >= since.getTime()).pop() ?? null;
    },
    async findPendingByPollKey(key) {
      return requests.filter((r) => r.pollMessageKey === key && r.status === 'pending').pop() ?? null;
    },
    async findLatestForSession(profileId, sessionId) {
      return requests.filter((r) => r.profileId === profileId && r.sessionId === sessionId).pop() ?? null;
    },
    async decide(id, status, via) {
      const r = requests.find((x) => x.id === id);
      if (!r || r.status !== 'pending') return false;
      r.status = status;
      r.decidedVia = via;
      return true;
    },
    async claimMarker(id) {
      const r = requests.find((x) => x.id === id);
      if (!r || r.status !== 'approved' || r.markerIssuedAt) return false;
      r.markerIssuedAt = now.toISOString();
      return true;
    },
    async releaseMarker(id) {
      requests.find((x) => x.id === id)!.markerIssuedAt = null;
    },
    async logEvent(profileId, event, _method, metadata) {
      events.push({ profileId, event, metadata });
    },
  };

  let pollCounter = 0;
  const sender = {
    sendPoll: vi.fn(async (to: string) => {
      pollCounter += 1;
      return { success: true, messageId: `true_${to.replace(/\D/g, '')}@c.us_POLL${pollCounter}` };
    }),
    sendText: vi.fn(async () => {}),
    alertChairman: vi.fn(async () => {}),
  };

  const deps: TwoFactorWhatsAppDeps = {
    repository,
    sender,
    now: () => now,
  };

  return {
    deps,
    sender,
    requests,
    events,
    addAccount(account: Partial<WhatsAppApprovalAccount> & { profileId: string }) {
      accounts.set(account.profileId, {
        fullName: 'Ada Admin',
        email: 'ada@example.test',
        roleName: 'financial_officer',
        twoFactorEnabled: true,
        twoFactorMethod: 'authenticator',
        phoneNumber: '+2348030000001',
        approveSignIns: true,
        ...account,
      });
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}
