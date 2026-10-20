import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import {
  clearWhatsAppDisputedContact,
  createWhatsAppLinkToken,
  importWhatsAppOptIns,
  resetWhatsAppPin,
  resetWhatsAppSession,
  setWhatsAppForcePin,
  setWhatsAppPrivacyNotice,
  updateWhatsAppPendingContact,
} from '../identity';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({
  PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage', WHATSAPP_VIEW: 'whatsapp.view' },
}));

const ROW_ID = '55555555-5555-4555-8555-555555555555'; // audit entity_id is a uuid (#594)
const authorized = { authorized: true, userId: 'admin-1', error: null };
const denied = { authorized: false, userId: null, error: 'Forbidden' };

type Result = { data?: unknown; error?: unknown };

/** Chainable, thenable query double; every builder method returns the same object. */
function query(result: Result = { data: null, error: null }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'in', 'is', 'update', 'insert', 'upsert', 'delete', 'order', 'filter']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function clientWith(...queries: ReturnType<typeof query>[]) {
  const from = vi.fn();
  queries.forEach((q) => from.mockReturnValueOnce(q));
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

const CSV = 'resident_code,phone_number\n';

describe('WhatsApp identity write actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
  });

  describe('authorization', () => {
    const cases: [string, () => Promise<{ success: boolean; error: string | null }>][] = [
      ['createWhatsAppLinkToken', () => createWhatsAppLinkToken('res-1')],
      ['createWhatsAppLinkToken (pin_setup)', () => createWhatsAppLinkToken('res-1', 'pin_setup')],
      ['resetWhatsAppPin', () => resetWhatsAppPin(ROW_ID)],
      ['importWhatsAppOptIns', () => importWhatsAppOptIns(`${CSV}RES001,+2348000000000`)],
      ['updateWhatsAppPendingContact', () => updateWhatsAppPendingContact({ phoneNumber: '+2348000000000', status: 'ignored' })],
      ['resetWhatsAppSession', () => resetWhatsAppSession('+2348000000000')],
      ['setWhatsAppForcePin', () => setWhatsAppForcePin(true)],
      ['clearWhatsAppDisputedContact', () => clearWhatsAppDisputedContact('+2348000000000')],
      ['setWhatsAppPrivacyNotice', () => setWhatsAppPrivacyNotice({ version: 'v1', text: 'Notice' })],
    ];

    it.each(cases)('%s fails closed with no client, write or audit when unauthorized', async (_name, call) => {
      vi.mocked(authorizePermission).mockResolvedValue(denied as never);
      await expect(call()).resolves.toEqual({ success: false, data: null, error: 'Forbidden' });
      expect(authorizePermission).toHaveBeenCalledWith('whatsapp.manage');
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('importWhatsAppOptIns', () => {
    it('imports known codes, skips duplicates and reports unknown codes', async () => {
      const residents = query({ data: [{ id: 'r1', resident_code: 'RES001' }, { id: 'r2', resident_code: 'RES002' }], error: null });
      const existing = query({ data: [{ resident_id: 'r2' }], error: null });
      const insert = query({ data: { id: ROW_ID }, error: null });
      const from = clientWith(residents, existing, insert);

      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001\nRES002,+2348000000002\nRES999,+2348000000003`);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ imported: 1, duplicates: 1 });
      expect(result.data?.errors).toContain('Unknown resident code: RES999');
      expect(from).toHaveBeenCalledTimes(3);
      expect(existing.is).toHaveBeenCalledWith('deactivated_at', null);
      expect(insert.upsert).toHaveBeenCalledTimes(1);
      expect(insert.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ resident_id: 'r1', source: 'admin_import', opted_in: true, deactivated_at: null }),
        { onConflict: 'resident_id,phone_number' }
      );
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'CREATE',
        entityType: 'whatsapp_optins',
        entityId: ROW_ID,
        newValues: expect.objectContaining({ batch: 'bulk-import', imported: 1, duplicates: 1 }),
      }));
    });

    it('counts a code repeated within the same file as a duplicate and inserts once', async () => {
      const residents = query({ data: [{ id: 'r1', resident_code: 'RES001' }], error: null });
      const existing = query({ data: [], error: null });
      const insert = query();
      clientWith(residents, existing, insert);
      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001\nRES001,+2348000000009`);
      expect(result.data).toMatchObject({ imported: 1, duplicates: 1 });
      expect(insert.upsert).toHaveBeenCalledTimes(1);
    });

    it('does not audit when nothing was imported (unknown code only)', async () => {
      clientWith(query({ data: [], error: null }));
      const result = await importWhatsAppOptIns(`${CSV}RES999,+2348000000003`);
      expect(result.data).toMatchObject({ imported: 0, duplicates: 0 });
      expect(result.data?.errors).toContain('Unknown resident code: RES999');
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('returns zero imported without touching the database when the file has no valid rows', async () => {
      const result = await importWhatsAppOptIns(CSV);
      expect(result).toMatchObject({ success: true, data: { imported: 0, duplicates: 0 } });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('does not audit when every insert errors', async () => {
      const residents = query({ data: [{ id: 'r1', resident_code: 'RES001' }], error: null });
      const existing = query({ data: [], error: null });
      const insert = query({ data: null, error: { message: 'boom' } });
      clientWith(residents, existing, insert);
      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001`);
      expect(result.data?.imported).toBe(0);
      expect(result.data?.errors).toContain('Failed to import RES001: boom');
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('fails without audit when the resident lookup errors', async () => {
      clientWith(query({ data: null, error: { message: 'db down' } }));
      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001`);
      expect(result.success).toBe(false);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('updateWhatsAppPendingContact', () => {
    const contact = { id: 'pc-1', phone_number: '+2348000000000', status: 'pending', resident_id: null };

    it('attaches a contact and audits the transition', async () => {
      const lookup = query({ data: contact, error: null });
      const resident = query({ data: { id: 'res-1' }, error: null });
      const update = query({ data: null, error: null });
      clientWith(lookup, resident, update);
      const result = await updateWhatsAppPendingContact({ phoneNumber: contact.phone_number, status: 'attached', residentId: 'res-1' });
      expect(result.success).toBe(true);
      expect(update.update).toHaveBeenCalledWith({ status: 'attached', resident_id: 'res-1' });
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE',
        entityType: 'whatsapp_pending_contacts',
        entityId: 'pc-1',
        oldValues: { status: 'pending', resident_id: null },
        newValues: { status: 'attached', resident_id: 'res-1' },
      }));
    });

    it('ignores a contact, clearing the resident link', async () => {
      const lookup = query({ data: contact, error: null });
      const update = query();
      clientWith(lookup, update);
      await updateWhatsAppPendingContact({ phoneNumber: contact.phone_number, status: 'ignored', residentId: 'res-1' });
      expect(update.update).toHaveBeenCalledWith({ status: 'ignored', resident_id: null });
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'pc-1', newValues: { status: 'ignored', resident_id: null } }));
    });

    it('refuses to attach without a resident id, with no write or audit', async () => {
      const lookup = query({ data: contact, error: null });
      const from = clientWith(lookup);
      const result = await updateWhatsAppPendingContact({ phoneNumber: contact.phone_number, status: 'attached' });
      expect(result.success).toBe(false);
      expect(from).toHaveBeenCalledTimes(1);
      expect(lookup.update).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('does not audit when the update errors', async () => {
      clientWith(query({ data: contact, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await updateWhatsAppPendingContact({ phoneNumber: contact.phone_number, status: 'ignored' });
      expect(result).toMatchObject({ success: false, error: 'Failed to update WhatsApp pending contact.' });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('fails when there is no pending contact', async () => {
      const from = clientWith(query({ data: null, error: null }));
      const result = await updateWhatsAppPendingContact({ phoneNumber: '+1', status: 'ignored' });
      expect(result.success).toBe(false);
      expect(from).toHaveBeenCalledTimes(1);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('resetWhatsAppSession', () => {
    it('deletes the session and audits it', async () => {
      const lookup = query({ data: { id: 'sess-1', resident_id: 'res-1' }, error: null });
      const del = query();
      clientWith(lookup, del);
      const result = await resetWhatsAppSession('+2348000000000');
      expect(result.success).toBe(true);
      expect(del.delete).toHaveBeenCalled();
      expect(del.eq).toHaveBeenCalledWith('id', 'sess-1');
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DELETE',
        entityType: 'whatsapp_sessions',
        entityId: 'sess-1',
      }));
    });

    it('does not audit when the delete errors', async () => {
      clientWith(query({ data: { id: 'sess-1', resident_id: 'res-1' }, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await resetWhatsAppSession('+2348000000000');
      expect(result.success).toBe(false);
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('is a quiet no-op without audit when no session exists', async () => {
      const lookup = query({ data: null, error: null });
      clientWith(lookup);
      const result = await resetWhatsAppSession('+2348000000000');
      expect(result.success).toBe(true);
      expect(lookup.delete).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('createWhatsAppLinkToken (#890)', () => {
    const resident = { id: ROW_ID, first_name: 'Ada', last_name: 'Okoro' };
    const minutesUntil = (iso: string) => (Date.parse(iso) - Date.now()) / 60000;

    function expectCodeNeverAudited(code: string) {
      const hash = createHash('sha256').update(code).digest('hex');
      for (const call of vi.mocked(logAudit).mock.calls) {
        const audit = JSON.stringify(call[0]);
        expect(audit).not.toContain(code);
        expect(audit).not.toContain(hash);
      }
      return hash;
    }

    it('issues a link code by default: 15 minutes, purpose link, no setup-code supersede', async () => {
      const insert = query({ data: { id: ROW_ID }, error: null });
      const from = clientWith(query({ data: resident, error: null }), insert);

      const result = await createWhatsAppLinkToken(ROW_ID);

      expect(result.success).toBe(true);
      expect(result.data?.code).toMatch(/^\d{6}$/);
      expect(from).toHaveBeenCalledTimes(2);
      const row = insert.insert.mock.calls[0]![0];
      expect(row).toMatchObject({ resident_id: ROW_ID, purpose: 'link', created_by: 'admin-1' });
      expect(row.expires_at).toBe(result.data?.expiresAt);
      expect(minutesUntil(row.expires_at)).toBeGreaterThan(14.9);
      expect(minutesUntil(row.expires_at)).toBeLessThanOrEqual(15);
      // Only the hash is stored; the plaintext goes back to the caller once.
      expect(row.token_hash).toBe(expectCodeNeverAudited(result.data!.code));
      expect(Object.values(row)).not.toContain(result.data!.code);
      expect(vi.mocked(logAudit).mock.calls[0]![0]).toMatchObject({
        action: 'CREATE',
        entityType: 'whatsapp_link_tokens',
        newValues: { resident_id: ROW_ID, purpose: 'link' },
      });
    });

    it('issues a 10-minute pin_setup code and retires earlier unused setup codes first', async () => {
      const supersede = query();
      const insert = query({ data: { id: ROW_ID }, error: null });
      clientWith(query({ data: resident, error: null }), supersede, insert);

      const result = await createWhatsAppLinkToken(ROW_ID, 'pin_setup');

      expect(result.success).toBe(true);
      expect(supersede.update).toHaveBeenCalledWith({ used_at: expect.any(String) });
      expect(supersede.eq).toHaveBeenCalledWith('resident_id', ROW_ID);
      expect(supersede.filter).toHaveBeenCalledWith('purpose', 'eq', 'pin_setup');
      expect(supersede.is).toHaveBeenCalledWith('used_at', null);
      const row = insert.insert.mock.calls[0]![0];
      expect(row.purpose).toBe('pin_setup');
      expect(minutesUntil(row.expires_at)).toBeGreaterThan(9.9);
      expect(minutesUntil(row.expires_at)).toBeLessThanOrEqual(10);
      expect(row.token_hash).toBe(expectCodeNeverAudited(result.data!.code));
      expect(vi.mocked(logAudit).mock.calls[0]![0].newValues).toMatchObject({ purpose: 'pin_setup' });
    });

    it('rejects an unknown purpose before touching the database', async () => {
      const result = await createWhatsAppLinkToken(ROW_ID, 'admin' as never);
      expect(result).toEqual({ success: false, data: null, error: 'Unknown code purpose' });
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('does not audit when the insert fails', async () => {
      clientWith(query({ data: resident, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await createWhatsAppLinkToken(ROW_ID);
      expect(result).toMatchObject({ success: false, data: null });
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('resetWhatsAppPin (#805, #890)', () => {
    const resident = { id: ROW_ID, first_name: 'Ada', last_name: 'Okoro' };

    it('clears PIN, attempts and lock, de-authenticates sessions, then issues a setup code once', async () => {
      const lookup = query({ data: resident, error: null });
      const pin = query();
      const sessions = query();
      const supersede = query();
      const insert = query({ data: { id: ROW_ID }, error: null });
      const from = clientWith(lookup, pin, sessions, supersede, insert);

      const result = await resetWhatsAppPin(ROW_ID);

      expect(result.success).toBe(true);
      expect(from.mock.calls.map((c) => c[0])).toEqual([
        'residents', 'residents', 'whatsapp_sessions', 'whatsapp_link_tokens', 'whatsapp_link_tokens',
      ]);
      expect(lookup.eq).toHaveBeenCalledWith('id', ROW_ID);
      expect(pin.update).toHaveBeenCalledWith({
        whatsapp_pin_hash: null,
        whatsapp_pin_set_at: null,
        whatsapp_pin_failed_attempts: 0,
        whatsapp_pin_locked_until: null,
        whatsapp_pin_failed_at: [],
        whatsapp_pin_hard_locked_at: null,
      });
      expect(pin.eq).toHaveBeenCalledWith('id', ROW_ID);
      expect(sessions.update).toHaveBeenCalledWith({ pin_authenticated: false });
      expect(sessions.eq).toHaveBeenCalledWith('resident_id', ROW_ID);
      expect(insert.insert.mock.calls[0]![0]).toMatchObject({ resident_id: ROW_ID, purpose: 'pin_setup' });
      expect(result.data?.code).toMatch(/^\d{6}$/);

      expect(logAudit).toHaveBeenCalledTimes(2);
      expect(vi.mocked(logAudit).mock.calls[0]![0]).toMatchObject({ action: 'UPDATE', entityType: 'residents', entityId: ROW_ID });
      const hash = createHash('sha256').update(result.data!.code).digest('hex');
      for (const call of vi.mocked(logAudit).mock.calls) {
        const audit = JSON.stringify(call[0]);
        expect(audit).not.toMatch(/whatsapp_pin_hash|scrypt/);
        expect(audit).not.toContain(result.data!.code);
        expect(audit).not.toContain(hash);
      }
    });

    it('does not write or audit when the resident is not found', async () => {
      const lookup = query({ data: null, error: null });
      const from = clientWith(lookup);
      const result = await resetWhatsAppPin(ROW_ID);
      expect(result).toMatchObject({ success: false, error: 'Resident not found' });
      expect(from).toHaveBeenCalledTimes(1);
      expect(lookup.update).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('does not audit, touch sessions or issue a code when clearing the PIN fails', async () => {
      const from = clientWith(query({ data: resident, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await resetWhatsAppPin(ROW_ID);
      expect(result).toMatchObject({ success: false, data: null });
      expect(from).toHaveBeenCalledTimes(2);
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('issues no code when sessions cannot be de-authenticated, and audits that', async () => {
      const from = clientWith(query({ data: resident, error: null }), query(), query({ data: null, error: { message: 'x' } }));
      const result = await resetWhatsAppPin(ROW_ID);
      expect(result).toMatchObject({ success: false, data: null });
      expect(from).toHaveBeenCalledTimes(3);
      expect(logAudit).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logAudit).mock.calls[0]![0].newValues).toMatchObject({ whatsapp_sessions_pin_authenticated: 'not cleared' });
    });
  });

  describe('setWhatsAppForcePin', () => {
    it('updates the setting and audits old and new values', async () => {
      const read = query({ data: { value: 'false' }, error: null });
      const update = query({ data: [{ id: ROW_ID }], error: null });
      clientWith(read, update);
      const result = await setWhatsAppForcePin(true);
      expect(result).toEqual({ success: true, data: true, error: null });
      expect(update.update).toHaveBeenCalledWith({ value: 'true' });
      expect(update.eq).toHaveBeenCalledWith('key', 'whatsapp_force_pin');
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE',
        entityType: 'system_settings',
        entityId: ROW_ID,
        oldValues: { value: 'false' },
        newValues: { key: 'whatsapp_force_pin', value: true },
      }));
    });

    it('surfaces an error and writes no audit when the update fails', async () => {
      clientWith(query({ data: { value: 'false' }, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await setWhatsAppForcePin(true);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('createWhatsAppLinkToken', () => {
    it('creates a code, returns it and audits the token id', async () => {
      const resident = query({ data: { id: 'res-1', first_name: 'Ada', last_name: 'Okoro' }, error: null });
      const token = query({ data: { id: 'tok-1' }, error: null });
      clientWith(resident, token);
      const result = await createWhatsAppLinkToken('res-1');
      expect(result.success).toBe(true);
      expect(result.data?.code).toMatch(/^\d{6}$/);
      expect(token.insert).toHaveBeenCalledWith(expect.objectContaining({ resident_id: 'res-1', created_by: 'admin-1' }));
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'whatsapp_link_tokens', entityId: 'tok-1' }));
    });

    it('does not audit when the token insert fails', async () => {
      clientWith(query({ data: { id: 'res-1', first_name: 'A', last_name: 'B' }, error: null }), query({ data: null, error: { message: 'x' } }));
      const result = await createWhatsAppLinkToken('res-1');
      expect(result.success).toBe(false);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });
});

describe('WhatsApp consent admin controls (#871)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
  });

  it('clears only a disputed number, to cleared, and audits it', async () => {
    const lookup = query({ data: { id: ROW_ID, phone_number: '+2348000000000', status: 'disputed', resident_id: 'res-1' }, error: null });
    const update = query({ error: null });
    clientWith(lookup, update);

    const result = await clearWhatsAppDisputedContact('+2348000000000');

    expect(result).toEqual({ success: true, data: null, error: null });
    expect(lookup.eq).toHaveBeenCalledWith('status', 'disputed');
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cleared' }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'whatsapp_pending_contacts',
      entityId: ROW_ID,
      oldValues: { status: 'disputed', resident_id: 'res-1' },
      newValues: { status: 'cleared', resident_id: 'res-1' },
    }));
  });

  it('refuses to clear a number that is not disputed, without a write or audit', async () => {
    const from = clientWith(query({ data: null, error: null }));

    const result = await clearWhatsAppDisputedContact('+2348000000000');

    expect(result.success).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('saves the notice text and version and audits old and new values', async () => {
    const old = query({ data: [{ key: 'whatsapp_privacy_notice_version', value: 'v1' }, { key: 'whatsapp_privacy_notice_text', value: 'Old' }], error: null });
    const saved = query({ data: [{ id: ROW_ID, key: 'whatsapp_privacy_notice_version' }, { id: 'other', key: 'whatsapp_privacy_notice_text' }], error: null });
    clientWith(old, saved);

    const result = await setWhatsAppPrivacyNotice({ version: ' v2 ', text: ' New notice ' });

    expect(result).toEqual({ success: true, data: { version: 'v2', text: 'New notice' }, error: null });
    expect(saved.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ key: 'whatsapp_privacy_notice_version', value: 'v2' }),
        expect.objectContaining({ key: 'whatsapp_privacy_notice_text', value: 'New notice' }),
      ],
      { onConflict: 'key' }
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'system_settings',
      entityId: ROW_ID,
      oldValues: { version: 'v1', text: 'Old' },
      newValues: { version: 'v2', text: 'New notice' },
    }));
  });

  it('refuses a changed text under the same version, without a write or audit', async () => {
    const old = query({ data: [{ key: 'whatsapp_privacy_notice_version', value: 'v1' }, { key: 'whatsapp_privacy_notice_text', value: 'Old' }], error: null });
    const from = clientWith(old);

    const result = await setWhatsAppPrivacyNotice({ version: 'v1', text: 'Reworded' });

    expect(result).toEqual({ success: false, data: null, error: 'Change the version when you change the notice text, so residents are asked to accept the new wording.' });
    expect(from).toHaveBeenCalledTimes(1);
    expect(old.upsert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('re-saves the same text under the same version', async () => {
    const old = query({ data: [{ key: 'whatsapp_privacy_notice_version', value: 'v1' }, { key: 'whatsapp_privacy_notice_text', value: 'Notice' }], error: null });
    const saved = query({ data: [{ id: ROW_ID, key: 'whatsapp_privacy_notice_version' }], error: null });
    clientWith(old, saved);

    const result = await setWhatsAppPrivacyNotice({ version: 'v1', text: ' Notice ' });

    expect(result.success).toBe(true);
    expect(saved.upsert).toHaveBeenCalled();
  });

  it.each([
    [{ version: ' ', text: 'Notice' }],
    [{ version: 'v1', text: '' }],
    [{ version: 'x'.repeat(51), text: 'Notice' }],
  ])('rejects a blank or oversized notice without a write (%o)', async (input) => {
    const result = await setWhatsAppPrivacyNotice(input);

    expect(result.success).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
