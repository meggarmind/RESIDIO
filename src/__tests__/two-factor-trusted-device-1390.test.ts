import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  checkTrustedDevice,
  hashTrustedDeviceToken,
  rememberTrustedDevice,
  revokeAllTrustedDevices,
  TRUSTED_DEVICE_TTL_SECONDS,
  type TrustedDevice,
  type TrustedDeviceRepository,
  type TrustedDeviceRevokeReason,
} from '@/lib/auth/two-factor-trusted-device';

/**
 * #1390: "Remember this computer for 30 days". The rules, the two verify-page routes, the settings
 * actions and the revoke on new backup codes. The database is an in-memory repository; no network.
 */

type MemRow = TrustedDevice & { tokenHash: string; revokedReason: TrustedDeviceRevokeReason | null };

function createMemoryRepo() {
  const rows: MemRow[] = [];
  const events: { profileId: string; event: string; metadata: Record<string, unknown> }[] = [];
  let next = 1;
  const live = (r: MemRow, now: Date) => r.revokedAt === null && Date.parse(r.expiresAt) > now.getTime();
  const repo: TrustedDeviceRepository = {
    async insert(input) {
      const row: MemRow = {
        id: `device-${next++}`,
        profileId: input.profileId,
        tokenHash: input.tokenHash,
        userAgentSummary: input.userAgentSummary,
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt.toISOString(),
        lastUsedAt: null,
        revokedAt: null,
        revokedReason: null,
      };
      rows.push(row);
      return { ...row };
    },
    async findByHash(tokenHash) {
      const row = rows.find((r) => r.tokenHash === tokenHash);
      return row ? { ...row } : null;
    },
    async touch(id, now) {
      const row = rows.find((r) => r.id === id && live(r, now));
      if (!row) return false;
      row.lastUsedAt = now.toISOString();
      return true;
    },
    async listLive(profileId, now) {
      return rows.filter((r) => r.profileId === profileId && live(r, now)).map((r) => ({ ...r }));
    },
    async revoke(profileId, reason, now, id) {
      const hit = rows.filter((r) => r.profileId === profileId && r.revokedAt === null && (!id || r.id === id));
      for (const r of hit) {
        r.revokedAt = now.toISOString();
        r.revokedReason = reason;
      }
      return hit.length;
    },
    async logEvent(profileId, event, metadata) {
      events.push({ profileId, event, metadata });
    },
  };
  return { repo, rows, events };
}

const mocks = vi.hoisted(() => ({
  mem: null as unknown,
  session: null as { userId: string; sessionId: string | null } | null,
  markerValid: false,
  issued: [] as string[],
  jar: new Map<string, string>(),
  authorized: true,
  user: 'admin-a' as string | null,
  logAudit: vi.fn(),
  failRevoke: false,
}));

vi.mock('@/lib/auth/two-factor-session', () => ({
  getTwoFactorSessionContext: async () => mocks.session,
  hasVerifiedTwoFactorSession: async (userId: string) => mocks.markerValid && mocks.session?.userId === userId,
  issueTwoFactorMarkerCookie: async () => {
    mocks.issued.push(mocks.session!.userId);
    return true;
  },
}));
vi.mock('@/lib/auth/two-factor-trusted-device-store', () => ({
  createTrustedDeviceRepository: () => {
    const repo = (mocks.mem as ReturnType<typeof createMemoryRepo>).repo;
    if (!mocks.failRevoke) return repo;
    return { ...repo, revoke: async () => { throw new Error('db down'); } };
  },
}));
vi.mock('@/lib/auth/two-factor-trusted-device-cookie', () => ({
  readTrustedDeviceCookie: async () => mocks.jar.get('residio_2fa_device') ?? null,
  setTrustedDeviceCookie: async (token: string) => { mocks.jar.set('residio_2fa_device', token); },
  clearTrustedDeviceCookie: async () => { mocks.jar.delete('residio_2fa_device'); },
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => (mocks.authorized ? { authorized: true } : { authorized: false, error: 'Forbidden' })),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));

/** A permissive Supabase stand-in for the backup-code action: every chain resolves to a profile row. */
function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'delete', 'update', 'insert', 'is', 'gt', 'order', 'limit']) c[m] = () => c;
  c.single = async () => ({ data: { two_factor_enabled: true, two_factor_method: 'authenticator', two_factor_secret_encrypted: 'x' }, error: null });
  c.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return c;
}
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user ? { id: mocks.user } : null } }) } }),
  createAdminClient: () => ({ from: () => chain() }),
}));
vi.mock('@/lib/auth/two-factor-guard', () => ({
  claimTwoFactorTry: async () => ({ allowed: true }),
  clearTwoFactorTries: async () => {},
  checkAccountCode: async () => true,
  tooManyTriesMessage: () => 'Too many',
}));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: async () => ({}) }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: vi.fn() }));

import { POST as rememberRoute } from '@/app/api/auth/2fa/trusted-device/remember/route';
import { POST as useRoute } from '@/app/api/auth/2fa/trusted-device/use/route';
import { authorizePermission } from '@/lib/auth/authorize';
import {
  forgetAllRememberedComputers,
  forgetRememberedComputer,
  listRememberedComputers,
} from '@/actions/two-factor/trusted-devices';
import { generateBackupCodes } from '@/actions/two-factor/backup-codes';

const A = 'admin-a';
const B = 'admin-b';
const DAY = 24 * 60 * 60 * 1000;
let mem: ReturnType<typeof createMemoryRepo>;

const remember = () =>
  rememberRoute(
    new NextRequest('http://localhost/api/auth/2fa/trusted-device/remember', {
      method: 'POST',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' },
    })
  );

/** Signs `user` in on a fresh login session of this browser (the cookie jar is kept). */
const signIn = (user: string, session = `${user}-session-${Math.random()}`) => {
  mocks.session = { userId: user, sessionId: session };
  mocks.user = user;
  mocks.markerValid = false;
};

beforeEach(() => {
  mem = createMemoryRepo();
  mocks.mem = mem;
  mocks.jar.clear();
  mocks.issued = [];
  mocks.authorized = true;
  mocks.failRevoke = false;
  mocks.logAudit.mockClear();
  vi.mocked(authorizePermission).mockClear();
  signIn(A);
});

describe('rules', () => {
  it('stores only the SHA-256 hash of a 32-byte token, for 30 days', async () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const result = await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: 'Chrome on Windows' }, mem.repo, now);
    expect(result!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(result!.token, 'base64url')).toHaveLength(32);
    expect(mem.rows[0].tokenHash).toBe(hashTrustedDeviceToken(result!.token));
    expect(mem.rows[0].tokenHash).not.toContain(result!.token);
    expect(mem.rows[0].expiresAt).toBe(new Date(now.getTime() + TRUSTED_DEVICE_TTL_SECONDS * 1000).toISOString());
    expect(TRUSTED_DEVICE_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(mem.events.map((e) => e.event)).toEqual(['trusted_device_remembered']);
  });

  it('refuses to remember without a completed second factor', async () => {
    expect(await rememberTrustedDevice({ userId: A, secondFactorDone: false, userAgentSummary: null }, mem.repo)).toBeNull();
    expect(mem.rows).toHaveLength(0);
  });

  it('a matching token of the same user is trusted and sets last_used_at', async () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { token } = (await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo, now))!;
    const later = new Date(now.getTime() + 5 * DAY);
    expect(await checkTrustedDevice({ userId: A, token }, mem.repo, later)).toMatchObject({ trusted: true });
    expect(mem.rows[0].lastUsedAt).toBe(later.toISOString());
    expect(mem.events.map((e) => e.event)).toContain('trusted_device_used');
  });

  it("user A's token never helps user B, and B's attempt leaves A's cookie alone", async () => {
    const { token } = (await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo))!;
    expect(await checkTrustedDevice({ userId: B, token }, mem.repo)).toEqual({ trusted: false, clearCookie: false });
    expect(mem.rows[0].lastUsedAt).toBeNull();
  });

  it('an expired token is refused and its cookie cleared', async () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { token } = (await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo, now))!;
    expect(await checkTrustedDevice({ userId: A, token }, mem.repo, new Date(now.getTime() + 29 * DAY))).toMatchObject({ trusted: true });
    expect(await checkTrustedDevice({ userId: A, token }, mem.repo, new Date(now.getTime() + 30 * DAY + 1000))).toEqual({ trusted: false, clearCookie: true });
  });

  it('a revoked token is refused', async () => {
    const { token } = (await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo))!;
    await revokeAllTrustedDevices(A, 'password_changed', mem.repo);
    expect(await checkTrustedDevice({ userId: A, token }, mem.repo)).toEqual({ trusted: false, clearCookie: true });
  });

  it('the rule itself refuses expired and revoked rows, even if the store would touch them', async () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const { token } = (await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo, now))!;
    const lenient = { ...mem.repo, touch: async () => true };
    expect(await checkTrustedDevice({ userId: A, token }, lenient, new Date(now.getTime() + 31 * DAY))).toMatchObject({ trusted: false });
    await revokeAllTrustedDevices(A, 'role_changed', mem.repo);
    expect(await checkTrustedDevice({ userId: A, token }, lenient, now)).toMatchObject({ trusted: false });
  });

  it('an unknown or malformed token is refused', async () => {
    expect(await checkTrustedDevice({ userId: A, token: 'x'.repeat(43) }, mem.repo)).toEqual({ trusted: false, clearCookie: true });
    expect(await checkTrustedDevice({ userId: A, token: 'short' }, mem.repo)).toEqual({ trusted: false, clearCookie: true });
    expect(await checkTrustedDevice({ userId: A, token: null }, mem.repo)).toEqual({ trusted: false, clearCookie: false });
  });

  it('revoke-all ends every row of that user only, and logs once', async () => {
    await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo);
    await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo);
    await rememberTrustedDevice({ userId: B, secondFactorDone: true, userAgentSummary: null }, mem.repo);
    expect(await revokeAllTrustedDevices(A, 'two_factor_disabled', mem.repo)).toBe(2);
    expect(mem.rows.map((r) => [r.profileId, r.revokedReason])).toEqual([[A, 'two_factor_disabled'], [A, 'two_factor_disabled'], [B, null]]);
    expect(mem.events.filter((e) => e.event === 'trusted_device_forgotten')).toEqual([
      { profileId: A, event: 'trusted_device_forgotten', metadata: { reason: 'two_factor_disabled', count: 2 } },
    ]);
  });
});

describe('remember route', () => {
  it('refuses without a residio_2fa marker for this session, and sets no cookie', async () => {
    const response = await remember();
    expect(response.status).toBe(403);
    expect(mem.rows).toHaveLength(0);
    expect(mocks.jar.size).toBe(0);
  });

  it('refuses without a session', async () => {
    mocks.session = null;
    expect((await remember()).status).toBe(401);
    expect(mem.rows).toHaveLength(0);
  });

  it('with the marker, remembers this computer for the session user and sets the cookie', async () => {
    mocks.markerValid = true;
    const response = await remember();
    expect(await response.json()).toMatchObject({ success: true });
    expect(mem.rows.map((r) => [r.profileId, r.userAgentSummary])).toEqual([[A, 'Chrome on Windows']]);
    expect(hashTrustedDeviceToken(mocks.jar.get('residio_2fa_device')!)).toBe(mem.rows[0].tokenHash);
  });
});

describe('use route', () => {
  async function rememberAsA() {
    mocks.markerValid = true;
    await remember();
  }

  it('issues the marker for a new session of the same user on a remembered computer', async () => {
    await rememberAsA();
    signIn(A);
    expect(await (await useRoute()).json()).toEqual({ trusted: true });
    expect(mocks.issued).toEqual([A]);
  });

  it('issues no marker for another user on that computer', async () => {
    await rememberAsA();
    signIn(B);
    expect(await (await useRoute()).json()).toEqual({ trusted: false });
    expect(mocks.issued).toEqual([]);
    expect(mocks.jar.has('residio_2fa_device')).toBe(true);
  });

  it('issues no marker without the cookie (another computer)', async () => {
    await rememberAsA();
    mocks.jar.clear();
    signIn(A);
    expect(await (await useRoute()).json()).toEqual({ trusted: false });
    expect(mocks.issued).toEqual([]);
  });

  it('after Forget all computers, asks again and clears the dead cookie', async () => {
    await rememberAsA();
    const keep = mocks.jar.get('residio_2fa_device')!;
    expect(await forgetAllRememberedComputers()).toMatchObject({ success: true });
    mocks.jar.set('residio_2fa_device', keep); // a copy of the cookie kept elsewhere
    signIn(A);
    expect(await (await useRoute()).json()).toEqual({ trusted: false });
    expect(mocks.issued).toEqual([]);
    expect(mocks.jar.has('residio_2fa_device')).toBe(false);
  });

  it('refuses without a session', async () => {
    mocks.session = null;
    expect((await useRoute()).status).toBe(401);
  });
});

describe('settings actions', () => {
  async function rememberAs(user: string) {
    signIn(user);
    mocks.markerValid = true;
    await remember();
  }

  it('lists only the signed-in user’s live computers and marks this one', async () => {
    await rememberAs(B);
    await rememberAs(A);
    const result = await listRememberedComputers();
    expect(result.data!.map((c) => [c.id, c.device, c.current])).toEqual([[mem.rows[1].id, 'Chrome on Windows', true]]);
    expect(vi.mocked(authorizePermission)).toHaveBeenCalledWith('two_factor.enable');
  });

  it('Forget ends one own row, clears this computer’s cookie and writes both audits', async () => {
    await rememberAs(A);
    const id = mem.rows[0].id;
    expect(await forgetRememberedComputer(id)).toEqual({ success: true, message: 'Computer forgotten' });
    expect(mem.rows[0].revokedReason).toBe('forgotten');
    expect(mocks.jar.has('residio_2fa_device')).toBe(false);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEACTIVATE', entityType: 'two_factor_trusted_devices', entityId: id }));
    expect(mem.events.map((e) => e.event)).toContain('trusted_device_forgotten');
  });

  it('Forget cannot end another user’s row', async () => {
    await rememberAs(B);
    const id = mem.rows[0].id;
    signIn(A);
    expect(await forgetRememberedComputer(id)).toEqual({ success: false, message: 'Computer not found' });
    expect(mem.rows[0].revokedAt).toBeNull();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('Forget all ends every own row and no other user’s', async () => {
    await rememberAs(B);
    await rememberAs(A);
    await rememberAs(A);
    expect(await forgetAllRememberedComputers()).toEqual({ success: true, message: 'All computers forgotten' });
    expect(mem.rows.map((r) => [r.profileId, r.revokedReason])).toEqual([[B, null], [A, 'forgotten_all'], [A, 'forgotten_all']]);
    expect(mocks.jar.has('residio_2fa_device')).toBe(false);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'two_factor_trusted_devices', newValues: { revoked_reason: 'forgotten_all', count: 2 } }));
  });

  it('every action refuses without two_factor.enable', async () => {
    await rememberAs(A);
    mocks.authorized = false;
    expect(await listRememberedComputers()).toEqual({ data: null, error: 'Forbidden' });
    expect(await forgetRememberedComputer(mem.rows[0].id)).toEqual({ success: false, message: 'Forbidden' });
    expect(await forgetAllRememberedComputers()).toEqual({ success: false, message: 'Forbidden' });
    expect(mem.rows[0].revokedAt).toBeNull();
  });
});

describe('new backup codes', () => {
  it('forget every remembered computer of the user', async () => {
    await rememberTrustedDevice({ userId: A, secondFactorDone: true, userAgentSummary: null }, mem.repo);
    await rememberTrustedDevice({ userId: B, secondFactorDone: true, userAgentSummary: null }, mem.repo);
    const result = await generateBackupCodes('123456');
    expect(result.success).toBe(true);
    expect(mem.rows.map((r) => [r.profileId, r.revokedReason])).toEqual([[A, 'backup_codes_regenerated'], [B, null]]);
  });

  it('are not made when the computers cannot be forgotten', async () => {
    mocks.failRevoke = true;
    const result = await generateBackupCodes('123456');
    expect(result).toEqual({ success: false, message: 'Could not make new backup codes. Please try again.' });
  });
});
