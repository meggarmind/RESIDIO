import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import {
  createWhatsAppLinkToken,
  importWhatsAppOptIns,
  resetWhatsAppSession,
  setWhatsAppForcePin,
  updateWhatsAppPendingContact,
} from '../identity';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({
  PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage', WHATSAPP_VIEW: 'whatsapp.view' },
}));

const authorized = { authorized: true, userId: 'admin-1', error: null };
const denied = { authorized: false, userId: null, error: 'Forbidden' };

type Result = { data?: unknown; error?: unknown };

/** Chainable, thenable query double; every builder method returns the same object. */
function query(result: Result = { data: null, error: null }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'in', 'update', 'insert', 'delete', 'order']) {
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
      ['importWhatsAppOptIns', () => importWhatsAppOptIns(`${CSV}RES001,+2348000000000`)],
      ['updateWhatsAppPendingContact', () => updateWhatsAppPendingContact({ phoneNumber: '+2348000000000', status: 'ignored' })],
      ['resetWhatsAppSession', () => resetWhatsAppSession('+2348000000000')],
      ['setWhatsAppForcePin', () => setWhatsAppForcePin(true)],
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
      const insert = query({ data: null, error: null });
      const from = clientWith(residents, existing, insert);

      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001\nRES002,+2348000000002\nRES999,+2348000000003`);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ imported: 1, duplicates: 1 });
      expect(result.data?.errors).toContain('Unknown resident code: RES999');
      expect(from).toHaveBeenCalledTimes(3);
      expect(insert.insert).toHaveBeenCalledTimes(1);
      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ resident_id: 'r1', source: 'admin_import', opted_in: true }));
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'CREATE',
        entityType: 'whatsapp_optins',
        entityId: 'bulk-import',
        newValues: expect.objectContaining({ imported: 1, duplicates: 1 }),
      }));
    });

    it('counts a code repeated within the same file as a duplicate and inserts once', async () => {
      const residents = query({ data: [{ id: 'r1', resident_code: 'RES001' }], error: null });
      const existing = query({ data: [], error: null });
      const insert = query();
      clientWith(residents, existing, insert);
      const result = await importWhatsAppOptIns(`${CSV}RES001,+2348000000001\nRES001,+2348000000009`);
      expect(result.data).toMatchObject({ imported: 1, duplicates: 1 });
      expect(insert.insert).toHaveBeenCalledTimes(1);
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

  describe('setWhatsAppForcePin', () => {
    it('updates the setting and audits old and new values', async () => {
      const read = query({ data: { value: 'false' }, error: null });
      const update = query();
      clientWith(read, update);
      const result = await setWhatsAppForcePin(true);
      expect(result).toEqual({ success: true, data: true, error: null });
      expect(update.update).toHaveBeenCalledWith({ value: 'true' });
      expect(update.eq).toHaveBeenCalledWith('key', 'whatsapp_force_pin');
      expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE',
        entityType: 'system_settings',
        entityId: 'whatsapp_force_pin',
        oldValues: { value: 'false' },
        newValues: { value: true },
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
