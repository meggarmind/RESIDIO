import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import {
  createRecipientGroup,
  deleteRecipientGroup,
  getRecipientGroups,
  setRecipientGroupMembers,
  updateRecipientGroup,
} from '../recipient-groups';
import { describeMember, sendableMembers } from '@/lib/groups/recipient-groups';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const GROUP_ID = '55555555-5555-4555-8555-555555555555';
const authorized = { authorized: true, userId: 'admin-1', error: null };

type Result = { data?: unknown; error?: unknown };

/** A query chain: every builder call returns the chain; `single()` and `await` resolve `result`. */
function query(result: Result) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'order']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

/** An admin client whose `from(table)` hands out the queued chains for that table in order. */
function client(tables: Record<string, Result[]>) {
  const chains: Record<string, ReturnType<typeof query>[]> = {};
  const from = vi.fn((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    const chain = query(next);
    (chains[table] ||= []).push(chain);
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return chains;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
  vi.mocked(logAudit).mockResolvedValue(undefined);
});

describe('recipient group permission gating (#819)', () => {
  it.each([
    ['createRecipientGroup', () => createRecipientGroup({ name: 'Officials' })],
    ['updateRecipientGroup', () => updateRecipientGroup(GROUP_ID, { name: 'Officials' })],
    ['setRecipientGroupMembers', () => setRecipientGroupMembers(GROUP_ID, ['res-1'])],
    ['deleteRecipientGroup', () => deleteRecipientGroup(GROUP_ID)],
  ])('%s needs groups.manage and touches nothing when denied', async (_name, call) => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(call()).resolves.toEqual({ data: null, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('groups.manage');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('reading groups needs groups.view', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(getRecipientGroups()).resolves.toEqual({ data: null, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('groups.view');
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe('recipient group writes are audited (#819)', () => {
  it('create trims the name and records CREATE', async () => {
    const chains = client({ recipient_groups: [{ data: { id: GROUP_ID, name: 'Officials', description: null }, error: null }] });
    await expect(createRecipientGroup({ name: '  Officials ', description: ' ' })).resolves.toEqual({ data: { id: GROUP_ID }, error: null });
    expect(chains.recipient_groups[0].insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Officials', description: null }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'recipient_groups', entityId: GROUP_ID, entityDisplay: 'Officials' }));
  });

  it('create refuses a blank name and a duplicate name without auditing', async () => {
    await expect(createRecipientGroup({ name: '   ' })).resolves.toEqual({ data: null, error: 'Enter a group name' });
    client({ recipient_groups: [{ data: null, error: { code: '23505', message: 'duplicate key' } }] });
    await expect(createRecipientGroup({ name: 'Officials' })).resolves.toEqual({ data: null, error: 'A group with that name already exists' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('rename records UPDATE with the old and new name', async () => {
    client({
      recipient_groups: [
        { data: { id: GROUP_ID, name: 'Officials', description: null }, error: null },
        { data: { id: GROUP_ID, name: 'Estate officials', description: null }, error: null },
      ],
    });
    await expect(updateRecipientGroup(GROUP_ID, { name: 'Estate officials' })).resolves.toEqual({ data: { id: GROUP_ID }, error: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE', entityType: 'recipient_groups', entityId: GROUP_ID,
      oldValues: { name: 'Officials', description: null }, newValues: { name: 'Estate officials', description: null },
    }));
  });

  it('member change adds and removes only the difference and records UPDATE', async () => {
    const chains = client({
      recipient_groups: [{ data: { id: GROUP_ID, name: 'Officials' }, error: null }],
      recipient_group_members: [
        { data: [{ resident_id: 'res-1' }, { resident_id: 'res-2' }], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    await expect(setRecipientGroupMembers(GROUP_ID, ['res-2', 'res-3'])).resolves.toEqual({ data: { id: GROUP_ID }, error: null });
    const [, removal, addition] = chains.recipient_group_members;
    expect(removal.in).toHaveBeenCalledWith('resident_id', ['res-1']);
    expect(addition.insert).toHaveBeenCalledWith([{ group_id: GROUP_ID, resident_id: 'res-3', created_by: 'admin-1' }]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE', entityType: 'recipient_groups', entityId: GROUP_ID,
      oldValues: { member_resident_ids: ['res-1', 'res-2'] }, newValues: { member_resident_ids: ['res-2', 'res-3'] },
    }));
  });

  it('an unchanged member list writes and audits nothing', async () => {
    client({
      recipient_groups: [{ data: { id: GROUP_ID, name: 'Officials' }, error: null }],
      recipient_group_members: [{ data: [{ resident_id: 'res-1' }], error: null }],
    });
    await expect(setRecipientGroupMembers(GROUP_ID, ['res-1'])).resolves.toEqual({ data: { id: GROUP_ID }, error: null });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('deleting a recipient group (#819 decision 4)', () => {
  it('refuses a group a setting selects, naming what uses it', async () => {
    const chains = client({
      recipient_groups: [{ data: { id: GROUP_ID, name: 'Estate officials', description: null }, error: null }],
      system_settings: [{ data: [{ key: 'clearance_copy_recipient_group_id', value: GROUP_ID }], error: null }],
    });
    await expect(deleteRecipientGroup(GROUP_ID)).resolves.toEqual({ data: null, error: 'Used by: Clearance certificate copies' });
    expect(chains.recipient_groups).toHaveLength(1);
    expect(chains.recipient_groups[0].delete).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses when usage cannot be read', async () => {
    client({
      recipient_groups: [{ data: { id: GROUP_ID, name: 'Officials', description: null }, error: null }],
      system_settings: [{ data: null, error: { message: 'boom' } }],
    });
    await expect(deleteRecipientGroup(GROUP_ID)).resolves.toEqual({ data: null, error: 'boom' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('deletes an unused group and records DELETE', async () => {
    const chains = client({
      recipient_groups: [
        { data: { id: GROUP_ID, name: 'Officials', description: null }, error: null },
        { data: null, error: null },
      ],
      system_settings: [{ data: [{ key: 'clearance_copy_recipient_group_id', value: 'another-group' }], error: null }],
    });
    await expect(deleteRecipientGroup(GROUP_ID)).resolves.toEqual({ data: { id: GROUP_ID }, error: null });
    expect(chains.recipient_groups[1].delete).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', entityType: 'recipient_groups', entityId: GROUP_ID, entityDisplay: 'Officials' }));
  });
});

describe('group members who cannot receive (#819)', () => {
  const resident = (overrides: Record<string, unknown>) => ({
    id: 'res-1', first_name: 'Ada', last_name: 'Bello', account_status: 'active', phone_primary: '08030000000',
    resident_houses: [{ is_active: true }], ...overrides,
  });

  it('flags moved-out and deactivated members and skips them when sending', () => {
    const members = [
      describeMember(resident({ id: 'active' }), true),
      describeMember(resident({ id: 'moved-out', resident_houses: [{ is_active: false }] }), true),
      describeMember(resident({ id: 'deactivated', account_status: 'inactive' }), true),
    ];
    expect(members.map((m) => [m.residentId, m.inactive, m.warning])).toEqual([
      ['active', false, null],
      ['moved-out', true, 'moved out'],
      ['deactivated', true, 'deactivated'],
    ]);
    expect(sendableMembers(members).map((m) => m.residentId)).toEqual(['active']);
  });

  it('warns for a member with no WhatsApp number or no opt-in, without skipping them', () => {
    expect(describeMember(resident({ phone_primary: '' }), false)).toMatchObject({ inactive: false, warning: 'no WhatsApp number' });
    expect(describeMember(resident({}), false)).toMatchObject({ inactive: false, warning: 'not opted in' });
  });

  it('loads groups with opt-in matched on the current number and usage attached', async () => {
    client({
      recipient_groups: [{
        data: [{
          id: GROUP_ID, name: 'Estate officials', description: null,
          recipient_group_members: [
            { resident: resident({ id: 'res-1', first_name: 'Ada' }) },
            { resident: resident({ id: 'res-2', first_name: 'Bola', phone_primary: '08031111111' }) },
          ],
        }],
        error: null,
      }],
      whatsapp_optins: [{ data: [{ resident_id: 'res-1', phone_number: '+2348030000000' }, { resident_id: 'res-2', phone_number: '+2348039999999' }], error: null }],
      system_settings: [{ data: [{ key: 'clearance_copy_recipient_group_id', value: GROUP_ID }], error: null }],
    });
    const result = await getRecipientGroups();
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({
      usedBy: ['Clearance certificate copies'],
      members: [
        { residentId: 'res-1', name: 'Ada Bello', warning: null },
        { residentId: 'res-2', name: 'Bola Bello', warning: 'not opted in' },
      ],
    });
  });
});
