import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { loadWhatsAppAdminAccount } from '@/lib/whatsapp/admin';
import {
  linkWhatsAppAdminNumber,
  saveWhatsAppAdminRoleGrid,
  setWhatsAppAdminCodeRequired,
  setWhatsAppAdminGlobalCodeRequired,
  unlinkWhatsAppAdminBinding,
} from '../admin-settings';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn().mockResolvedValue({ status: 'ok', value: true }) }));
vi.mock('@/lib/whatsapp/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp/admin')>()),
  loadWhatsAppAdminAccount: vi.fn(),
  createSupabaseWhatsAppAdminRepository: () => ({ emailAdmin: vi.fn().mockResolvedValue(undefined) }),
}));

const authMock = vi.mocked(authorizePermission);
const clientMock = vi.mocked(createAdminClient);
const auditMock = vi.mocked(logAudit);
const accountMock = vi.mocked(loadWhatsAppAdminAccount);
const authorized = { authorized: true, userId: 'owner-1', role: null, roleName: null, roleId: null, permissions: ['system.manage_roles'], error: null };
const denied = { authorized: false, userId: 'u', role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };

type Result = { data: unknown; error: unknown };

/** A thenable query builder; each table answers with the result registered for it. */
function fakeClient(results: Record<string, Result>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      let inserting = false;
      for (const method of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'is', 'not', 'order']) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          if (method === 'insert') inserting = true;
          return query;
        };
      }
      query.single = () => Promise.resolve((inserting && results[`${table}:insert`]) || results[table] || { data: null, error: null });
      query.maybeSingle = query.single;
      query.then = (resolve: (value: Result) => unknown) => Promise.resolve(resolve(results[table] ?? { data: [], error: null }));
      return query;
    },
  };
  clientMock.mockReturnValue(client as never);
  return calls;
}

const adminAccount = {
  profileId: 'admin-1', fullName: 'Ada Admin', email: 'ada@example.com', approvalStatus: 'active', roleId: 'role-1',
  roleName: 'financial_officer', roleDisplayName: 'Financial Officer', roleCategory: 'exco',
  permissions: ['whatsapp_admin.query'], totpSecret: 'secret',
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(authorized);
});

describe('WhatsApp admin settings actions (#1295): permission', () => {
  const calls: [string, () => Promise<{ success: boolean }>][] = [
    ['linkWhatsAppAdminNumber', () => linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: true })],
    ['unlinkWhatsAppAdminBinding', () => unlinkWhatsAppAdminBinding('b-1')],
    ['setWhatsAppAdminCodeRequired', () => setWhatsAppAdminCodeRequired('b-1', false)],
    ['setWhatsAppAdminGlobalCodeRequired', () => setWhatsAppAdminGlobalCodeRequired(false)],
    ['saveWhatsAppAdminRoleGrid', () => saveWhatsAppAdminRoleGrid([{ roleId: 'r1', permission: 'whatsapp_admin.collections', granted: true }])],
  ];

  it.each(calls)('%s needs the roles-management permission and writes nothing without it', async (_name, call) => {
    authMock.mockResolvedValue(denied);
    const result = await call();
    expect(result.success).toBe(false);
    expect(authMock).toHaveBeenCalledWith('system.manage_roles');
    expect(clientMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('linkWhatsAppAdminNumber', () => {
  it('creates an active link for the admin and audits ACTIVATE with a masked number', async () => {
    accountMock.mockResolvedValue(adminAccount as never);
    const calls = fakeClient({ whatsapp_admin_bindings: { data: { id: 'b-9' }, error: null } });
    const result = await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: false });
    expect(result).toEqual({ success: true, data: { bindingId: 'b-9' }, error: null });
    const insert = calls.find((call) => call.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ profile_id: 'admin-1', phone_number: '+2348012345678', code_required: false, created_by: 'owner-1' });
    expect(insert.bound_at).toBeTruthy();
    const audit = auditMock.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'ACTIVATE', entityType: 'whatsapp_admin_bindings', entityId: 'b-9' });
    expect(JSON.stringify(audit)).not.toContain('8012345678');
  });

  it('refuses an admin with no authenticator while a code is needed, and links when this admin needs none', async () => {
    accountMock.mockResolvedValue({ ...adminAccount, totpSecret: null } as never);
    fakeClient({ whatsapp_admin_bindings: { data: { id: 'b-9' }, error: null } });
    const refused = await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: true });
    expect(refused.success).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
    const linked = await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: false });
    expect(linked.success).toBe(true);
  });

  it('refuses a bad number and a role that cannot use admin tools', async () => {
    accountMock.mockResolvedValue(adminAccount as never);
    fakeClient({});
    expect((await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '12', codeRequired: true })).success).toBe(false);
    accountMock.mockResolvedValue({ ...adminAccount, roleCategory: 'resident' } as never);
    expect((await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: true })).success).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('reports a number or admin that is already linked', async () => {
    accountMock.mockResolvedValue(adminAccount as never);
    fakeClient({ 'whatsapp_admin_bindings:insert': { data: null, error: { code: '23505' } } });
    const result = await linkWhatsAppAdminNumber({ profileId: 'admin-1', phone: '08012345678', codeRequired: true });
    expect(result.error).toMatch(/already linked/);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe('code switches and unlink', () => {
  it('saves the per-admin switch and audits the old and new value', async () => {
    const calls = fakeClient({ whatsapp_admin_bindings: { data: { id: 'b-1', code_required: false }, error: null } });
    const result = await setWhatsAppAdminCodeRequired('b-1', false);
    expect(result.success).toBe(true);
    expect(calls.find((call) => call.method === 'update')!.args[0]).toMatchObject({ code_required: false });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: 'UPDATE', oldValues: { code_required: true }, newValues: { code_required: false } });
  });

  it('does not audit a switch for a link that has ended', async () => {
    fakeClient({ whatsapp_admin_bindings: { data: null, error: null } });
    expect((await setWhatsAppAdminCodeRequired('b-1', false)).success).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('saves the global switch to the setting and audits it', async () => {
    const calls = fakeClient({ system_settings: { data: { id: 's-1', value: true }, error: null } });
    const result = await setWhatsAppAdminGlobalCodeRequired(false);
    expect(result.success).toBe(true);
    expect(calls.find((call) => call.method === 'upsert')!.args[0]).toMatchObject({ key: 'whatsapp_admin_code_required', value: false });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: 'UPDATE', entityType: 'system_settings', entityId: 's-1', newValues: { value: false } });
  });

  it('unlinks another admin and audits DEACTIVATE', async () => {
    fakeClient({ whatsapp_admin_bindings: { data: [{ id: 'b-1', phone_number: '+2348012345678' }], error: null } });
    const result = await unlinkWhatsAppAdminBinding('b-1');
    expect(result.data).toEqual({ unlinked: 1 });
    expect(auditMock.mock.calls[0][0]).toMatchObject({ action: 'DEACTIVATE', entityId: 'b-1' });
  });
});

describe('saveWhatsAppAdminRoleGrid', () => {
  const tables = {
    app_permissions: { data: [{ id: 'p-1', name: 'whatsapp_admin.collections' }, { id: 'p-2', name: 'whatsapp_admin.debt_report' }], error: null },
    app_roles: { data: [{ id: 'r1', name: 'chairman', display_name: 'Chairman' }], error: null },
    role_permissions: { data: null, error: null },
  };

  it('refuses any permission outside the Admin tools items, before touching the database', async () => {
    fakeClient(tables);
    const result = await saveWhatsAppAdminRoleGrid([{ roleId: 'r1', permission: 'system.manage_roles', granted: true }]);
    expect(result.success).toBe(false);
    expect(clientMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('grants and removes item permissions and audits one entry per role', async () => {
    const calls = fakeClient(tables);
    const result = await saveWhatsAppAdminRoleGrid([
      { roleId: 'r1', permission: 'whatsapp_admin.collections', granted: true },
      { roleId: 'r1', permission: 'whatsapp_admin.debt_report', granted: false },
    ]);
    expect(result).toEqual({ success: true, data: { changed: 2 }, error: null });
    expect(calls.find((call) => call.table === 'role_permissions' && call.method === 'upsert')!.args[0]).toEqual({ role_id: 'r1', permission_id: 'p-1' });
    expect(calls.some((call) => call.table === 'role_permissions' && call.method === 'delete')).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0]).toMatchObject({
      action: 'UPDATE',
      entityType: 'role_permissions',
      entityId: 'r1',
      newValues: { 'whatsapp_admin.collections': true, 'whatsapp_admin.debt_report': false },
      oldValues: { 'whatsapp_admin.collections': false, 'whatsapp_admin.debt_report': true },
    });
  });

  it('refuses a role outside the staff categories', async () => {
    fakeClient({ ...tables, app_roles: { data: [], error: null } });
    const result = await saveWhatsAppAdminRoleGrid([{ roleId: 'resident-role', permission: 'whatsapp_admin.collections', granted: true }]);
    expect(result.success).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
